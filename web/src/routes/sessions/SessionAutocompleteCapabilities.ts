import type { QueryClient } from '@tanstack/react-query'
import type { CommandCapability } from '@viby/protocol/types'
import { useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { getAutocompleteMatchScore } from '@/hooks/queries/autocompleteFuzzyMatch'
import type { Suggestion, SuggestionBadge } from '@/hooks/useActiveSuggestions'
import { getNetworkInformation, shouldPreloadForegroundSessionDetail } from '@/lib/networkPreloadPolicy'
import { queryKeys } from '@/lib/query-keys'

type CommandCapabilitiesResponse = Awaited<ReturnType<ApiClient['getCommandCapabilities']>>

type SessionAutocompleteCapabilitiesOptions = {
    api: ApiClient | null
    queryClient: QueryClient
    sessionId: string | null
}

type CommandCapabilityQueryCacheEvent = {
    type: string
    query: {
        queryKey: readonly unknown[]
    }
    action?: {
        type: string
    }
}

function isMatchingCommandCapabilitiesQueryKey(
    queryKey: readonly unknown[],
    expectedQueryKey: readonly unknown[]
): boolean {
    if (queryKey.length !== expectedQueryKey.length) {
        return false
    }

    return queryKey.every((value, index) => value === expectedQueryKey[index])
}

function shouldRefreshAutocompleteForEvent(
    event: CommandCapabilityQueryCacheEvent,
    expectedQueryKey: readonly unknown[]
): boolean {
    if (event.type !== 'updated') {
        return false
    }

    if (!isMatchingCommandCapabilitiesQueryKey(event.query.queryKey, expectedQueryKey)) {
        return false
    }

    return event.action?.type === 'invalidate'
}

export function getCommandCapabilitiesResponse(
    options: SessionAutocompleteCapabilitiesOptions
): CommandCapabilitiesResponse | undefined {
    return options.queryClient.getQueryData<CommandCapabilitiesResponse>(
        queryKeys.commandCapabilities(options.sessionId ?? 'unknown')
    )
}

export async function loadCommandCapabilitiesResponse(
    options: SessionAutocompleteCapabilitiesOptions
): Promise<CommandCapabilitiesResponse | undefined> {
    const cached = getCommandCapabilitiesResponse(options)
    const queryKey = queryKeys.commandCapabilities(options.sessionId ?? 'unknown')
    const queryState = options.queryClient.getQueryState(queryKey)
    if (cached !== undefined && !queryState?.isInvalidated) {
        return cached
    }

    const { api, queryClient, sessionId } = options
    if (!api || !sessionId) {
        return undefined
    }

    return await queryClient.fetchQuery({
        queryKey,
        queryFn: async () => {
            const current = getCommandCapabilitiesResponse(options)
            const response = await api.getCommandCapabilities(sessionId, current?.revision)
            if (response.success && response.notModified && current?.success) {
                return current
            }
            return response
        },
        staleTime: Infinity,
        gcTime: 2 * 60 * 1000,
        retry: false,
    })
}

export async function prefetchCommandCapabilitiesResponse(
    options: SessionAutocompleteCapabilitiesOptions
): Promise<void> {
    const { api, queryClient, sessionId } = options
    if (!api || !sessionId) {
        return
    }

    if (
        !shouldPreloadForegroundSessionDetail({
            connection: getNetworkInformation(),
            visibilityState: typeof document === 'undefined' ? undefined : document.visibilityState,
        })
    ) {
        return
    }

    await queryClient.prefetchQuery({
        queryKey: queryKeys.commandCapabilities(sessionId),
        queryFn: async () => await api.getCommandCapabilities(sessionId),
        staleTime: Infinity,
        gcTime: 2 * 60 * 1000,
        retry: false,
    })
}

export function useCommandCapabilityRefreshKey(options: { queryClient: QueryClient; sessionId: string }): number {
    const queryKey = useMemo(() => queryKeys.commandCapabilities(options.sessionId), [options.sessionId])
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        return options.queryClient.getQueryCache().subscribe((event) => {
            if (!shouldRefreshAutocompleteForEvent(event, queryKey)) {
                return
            }

            setRefreshKey((value) => value + 1)
        })
    }, [options.queryClient, queryKey])

    return refreshKey
}

function getSourceBadge(capability: CommandCapability): SuggestionBadge | null {
    switch (capability.source) {
        case 'project':
            return { kind: 'source', source: 'project', tone: 'accent' }
        case 'user':
            return { kind: 'source', source: 'local', tone: 'neutral' }
        case 'plugin':
            return { kind: 'source', source: 'plugin', tone: 'accent' }
        case 'viby':
            return { kind: 'source', source: 'viby', tone: 'accent' }
        default:
            return null
    }
}

function getEffectBadge(capability: CommandCapability): SuggestionBadge | null {
    switch (capability.sessionEffect) {
        case 'mutates_context':
            return { kind: 'effect', effect: 'context', tone: 'warning' }
        default:
            return null
    }
}

function getGroupLabel(capability: CommandCapability): string {
    if (capability.kind === 'viby_skill') {
        return 'Viby Skills'
    }
    if (capability.selectionMode !== 'insert') {
        return 'Session Actions'
    }
    if (capability.source === 'project' || capability.source === 'user' || capability.source === 'plugin') {
        return 'Custom Commands'
    }
    return 'Native Commands'
}

export function toSuggestion(capability: CommandCapability): Suggestion {
    const badges: SuggestionBadge[] = [{ kind: 'provider', provider: capability.provider, tone: 'neutral' }]
    const sourceBadge = getSourceBadge(capability)
    if (sourceBadge) {
        badges.push(sourceBadge)
    }
    const effectBadge = getEffectBadge(capability)
    if (effectBadge) {
        badges.push(effectBadge)
    }

    return {
        key: capability.id,
        text: capability.trigger,
        label: capability.label,
        description:
            capability.selectionMode === 'disabled'
                ? (capability.disabledReason ?? capability.description)
                : capability.description,
        content: capability.content,
        source: capability.source === 'viby' ? 'viby' : capability.source,
        kind: capability.kind,
        provider: capability.provider,
        selectionMode: capability.selectionMode,
        actionType: capability.actionType,
        disabled: capability.selectionMode === 'disabled',
        disabledReason: capability.disabledReason,
        groupLabel: getGroupLabel(capability),
        badges,
    }
}

export function filterCapabilitiesByPrefix(
    capabilities: readonly CommandCapability[],
    prefix: '/' | '$'
): CommandCapability[] {
    return capabilities.filter((capability) => capability.trigger.startsWith(prefix))
}

export function filterCapabilitiesBySearchTerm(
    capabilities: readonly CommandCapability[],
    searchTerm: string
): CommandCapability[] {
    return capabilities
        .map((capability) => ({
            capability,
            score: getAutocompleteMatchScore(searchTerm, capability.trigger.slice(1).toLowerCase()),
        }))
        .filter((item) => Number.isFinite(item.score))
        .sort((a, b) => a.score - b.score || a.capability.trigger.localeCompare(b.capability.trigger))
        .map((item) => item.capability)
}
