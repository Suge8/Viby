import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { LocalSessionCatalog, LocalSessionCatalogEntry } from '@/types/api'
import {
    type NewSessionMode,
    RECOVER_LOCAL_DRIVER_SELECTION_NONE,
    type RecoverLocalDriverSelection,
} from './newSessionModes'
import { buildRecoverSelectionKey } from './recoverLocalSelection'

type HapticFeedback = {
    notification: (type: 'success' | 'error') => void
}

const EMPTY_LOCAL_SESSION_CATALOG: LocalSessionCatalog = {
    capabilities: [],
    sessions: [],
}

function matchesRecoverSearch(session: LocalSessionCatalogEntry, query: string): boolean {
    if (!query) {
        return true
    }

    const haystack = [session.title, session.summary, session.path, session.providerSessionId, session.driver]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n')
        .toLowerCase()

    return haystack.includes(query)
}

export function useRecoverLocalState(options: {
    api: ApiClient
    initialMode?: NewSessionMode
    isFormDisabled: boolean
    directory: string | null
    haptic: HapticFeedback
    onSuccess: (sessionId: string) => void
    clearError: () => void
    setError: (message: string) => void
    formatError: (error: unknown) => string
    t: (key: string) => string
}) {
    const [mode, setMode] = useState<NewSessionMode>(options.initialMode ?? 'start')
    const [recoverSearchQuery, setRecoverSearchQuery] = useState('')
    const [recoverDriverSelection, setRecoverDriverSelection] = useState<RecoverLocalDriverSelection>(
        RECOVER_LOCAL_DRIVER_SELECTION_NONE
    )
    const [selectedRecoverSessionKey, setSelectedRecoverSessionKey] = useState<string | null>(null)
    const [catalog, setCatalog] = useState<LocalSessionCatalog>(EMPTY_LOCAL_SESSION_CATALOG)
    const [catalogDirectory, setCatalogDirectory] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isRecovering, setIsRecovering] = useState(false)
    const deferredRecoverSearchQuery = useDeferredValue(recoverSearchQuery.trim().toLowerCase())
    const deferredDirectory = useDeferredValue(options.directory)
    const formatErrorRef = useRef(options.formatError)

    useEffect(() => {
        formatErrorRef.current = options.formatError
    }, [options.formatError])

    useEffect(() => {
        setMode(options.initialMode ?? 'start')
    }, [options.initialMode])

    useEffect(() => {
        if (
            mode !== 'recover-local' ||
            !deferredDirectory ||
            recoverDriverSelection === RECOVER_LOCAL_DRIVER_SELECTION_NONE
        ) {
            setCatalog(EMPTY_LOCAL_SESSION_CATALOG)
            setCatalogDirectory(null)
            setLoadError(null)
            setIsLoading(false)
            return
        }

        const abortController = new AbortController()
        let cancelled = false
        setIsLoading(true)
        setLoadError(null)
        setCatalogDirectory(null)

        options.api
            .listRuntimeLocalSessions(deferredDirectory, recoverDriverSelection, { signal: abortController.signal })
            .then((nextCatalog) => {
                if (cancelled) {
                    return
                }
                setCatalog(nextCatalog)
                setCatalogDirectory(deferredDirectory)
            })
            .catch((error) => {
                if (cancelled) {
                    return
                }
                if (abortController.signal.aborted) {
                    return
                }
                setCatalog(EMPTY_LOCAL_SESSION_CATALOG)
                setCatalogDirectory(null)
                setLoadError(formatErrorRef.current(error))
            })
            .finally(() => {
                if (!cancelled) {
                    setIsLoading(false)
                }
            })

        return () => {
            cancelled = true
            abortController.abort()
        }
    }, [deferredDirectory, mode, options.api, recoverDriverSelection])

    const filteredSessions = useMemo(() => {
        return catalog.sessions.filter((session) => matchesRecoverSearch(session, deferredRecoverSearchQuery))
    }, [catalog.sessions, deferredRecoverSearchQuery])

    const unavailableCapabilities = useMemo(() => {
        return catalog.capabilities.filter((capability) => !capability.supported)
    }, [catalog.capabilities])

    useEffect(() => {
        if (mode !== 'recover-local') {
            return
        }

        if (
            selectedRecoverSessionKey &&
            filteredSessions.some((session) => buildRecoverSelectionKey(session) === selectedRecoverSessionKey)
        ) {
            return
        }

        setSelectedRecoverSessionKey(filteredSessions[0] ? buildRecoverSelectionKey(filteredSessions[0]) : null)
    }, [filteredSessions, mode, selectedRecoverSessionKey])

    const selectedRecoverSession =
        filteredSessions.find((session) => buildRecoverSelectionKey(session) === selectedRecoverSessionKey) ?? null
    const isCatalogCurrent =
        Boolean(options.directory) &&
        !isLoading &&
        catalogDirectory === options.directory &&
        deferredDirectory === options.directory

    async function handleRecover(): Promise<void> {
        if (!selectedRecoverSession || !options.directory || !isCatalogCurrent) {
            return
        }
        if (!catalogDirectory) {
            throw new Error('Recover-local catalog path unavailable')
        }
        const recoverPath = catalogDirectory

        options.clearError()
        setIsRecovering(true)
        try {
            const recoveredSession = await options.api.importRuntimeLocalSession({
                path: recoverPath,
                driver: selectedRecoverSession.driver,
                providerSessionId: selectedRecoverSession.providerSessionId,
            })
            options.haptic.notification('success')
            options.onSuccess(recoveredSession.session.id)
        } catch (error) {
            options.haptic.notification('error')
            options.setError(options.formatError(error))
        } finally {
            setIsRecovering(false)
        }
    }

    return {
        mode,
        setMode,
        isRecovering,
        canRecover: Boolean(
            selectedRecoverSession && options.directory && isCatalogCurrent && !options.isFormDisabled && !isRecovering
        ),
        recoverActionLabel: options.t('newSession.recover.action'),
        handleRecover,
        panelProps: {
            sessions: filteredSessions,
            unavailableCapabilities,
            selectedSessionKey: selectedRecoverSessionKey,
            searchQuery: recoverSearchQuery,
            driverSelection: recoverDriverSelection,
            isLoading,
            error: loadError,
            isDisabled: options.isFormDisabled,
            hasDirectory: Boolean(options.directory),
            onSearchQueryChange: setRecoverSearchQuery,
            onDriverSelectionChange: setRecoverDriverSelection,
            onSelectSession: setSelectedRecoverSessionKey,
        },
    }
}
