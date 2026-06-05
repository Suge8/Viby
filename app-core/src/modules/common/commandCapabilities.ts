import {
    isHiddenCommandCapabilityTrigger,
    isLifecycleOwnedCommandEffect,
    resolveCommandCapabilityActionType,
    resolveCommandSessionEffect,
} from '@viby/protocol'
import type {
    CommandCapabilitiesResponse,
    CommandCapability,
    CommandCapabilitySelectionMode,
    CommandCapabilitySessionEffect,
    SessionDriver,
} from '@viby/protocol/types'
import { type CommandCapabilitySnapshot, loadCachedCommandCapabilities } from './commandCapabilityCache'
import { listSlashCommands } from './slashCommands'
import { listSlashCommandWatchRoots } from './slashCommandWatchRoots'

export interface ListCommandCapabilitiesRequest {
    agent: SessionDriver
    revision?: string
}

export interface ListCommandCapabilitiesResponse extends CommandCapabilitiesResponse {}

function resolveSelectionMode(
    trigger: string,
    sessionEffect: CommandCapabilitySessionEffect
): {
    selectionMode: CommandCapabilitySelectionMode
    actionType?: 'open_new_session'
    disabledReason?: string
} {
    const actionType = resolveCommandCapabilityActionType(trigger)
    if (actionType) {
        return {
            selectionMode: 'action',
            actionType,
        }
    }

    if (isLifecycleOwnedCommandEffect(sessionEffect)) {
        return {
            selectionMode: 'disabled',
            disabledReason: 'Handled by Viby lifecycle owner instead of direct provider send.',
        }
    }

    return {
        selectionMode: 'insert',
    }
}

function createNativeCommandCapability(
    agent: SessionDriver,
    command: Awaited<ReturnType<typeof listSlashCommands>>[number]
): CommandCapability {
    const trigger = `/${command.name}`
    const sessionEffect = resolveCommandSessionEffect(agent, trigger)
    const selection = resolveSelectionMode(trigger, sessionEffect)

    return {
        id: `${agent}:${command.source}:${command.name}`,
        trigger,
        label: trigger,
        description: command.description,
        kind: 'native_command',
        source: command.source,
        provider: agent,
        sessionEffect,
        requiresLifecycleOwner: isLifecycleOwnedCommandEffect(sessionEffect),
        selectionMode: selection.selectionMode,
        actionType: selection.actionType,
        displayGroup: selection.selectionMode === 'insert' ? 'native' : 'session',
        riskLevel: selection.selectionMode === 'insert' ? 'low' : 'high',
        content: command.content,
        pluginName: command.pluginName,
        disabledReason: selection.disabledReason,
    }
}

function sortCapabilities(capabilities: readonly CommandCapability[]): CommandCapability[] {
    const displayGroupOrder: Record<CommandCapability['displayGroup'], number> = {
        native: 0,
        project: 1,
        skill: 2,
        session: 3,
    }

    return [...capabilities].sort((a, b) => {
        const groupDiff = displayGroupOrder[a.displayGroup] - displayGroupOrder[b.displayGroup]
        if (groupDiff !== 0) {
            return groupDiff
        }

        const providerDiff = a.provider.localeCompare(b.provider)
        if (providerDiff !== 0) {
            return providerDiff
        }

        return a.trigger.localeCompare(b.trigger)
    })
}

export async function listCommandCapabilities(
    agent: SessionDriver,
    workingDirectory?: string
): Promise<CommandCapability[]> {
    return (await getCommandCapabilitySnapshot(agent, workingDirectory)).capabilities
}

export async function getCommandCapabilitySnapshot(
    agent: SessionDriver,
    workingDirectory?: string,
    options?: {
        onInvalidate?: () => void
    }
): Promise<CommandCapabilitySnapshot> {
    return await loadCachedCommandCapabilities({
        agent,
        workingDirectory,
        onInvalidate: options?.onInvalidate,
        load: async () => {
            const slashCommands = await listSlashCommands(agent, workingDirectory)
            const visibleSlashCommands = slashCommands.filter(
                (command) => !isHiddenCommandCapabilityTrigger(`/${command.name}`)
            )

            return sortCapabilities(
                visibleSlashCommands.map((command) => createNativeCommandCapability(agent, command))
            )
        },
        listWatchRoots: async () => await listSlashCommandWatchRoots(agent, workingDirectory),
    })
}
