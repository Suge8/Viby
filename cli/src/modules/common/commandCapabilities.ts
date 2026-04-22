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
import { discoverSkills, type SkillSummary } from './skills'
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

function createVibySkillCapability(skill: SkillSummary): CommandCapability {
    return {
        id: `viby:${skill.name}`,
        trigger: `$${skill.name}`,
        label: `$${skill.name}`,
        description: skill.description,
        kind: 'viby_skill',
        source: 'viby',
        provider: 'shared',
        sessionEffect: 'none',
        requiresLifecycleOwner: false,
        selectionMode: 'insert',
        displayGroup: 'skill',
        riskLevel: 'low',
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
            const [slashCommands, skillDiscovery] = await Promise.all([
                listSlashCommands(agent, workingDirectory),
                discoverSkills(workingDirectory),
            ])
            const visibleSlashCommands = slashCommands.filter(
                (command) => !isHiddenCommandCapabilityTrigger(`/${command.name}`)
            )

            const capabilities = [
                ...visibleSlashCommands.map((command) => createNativeCommandCapability(agent, command)),
                ...skillDiscovery.skills.map((skill) => createVibySkillCapability(skill)),
            ]

            return sortCapabilities(capabilities)
        },
        listWatchRoots: async () => {
            const [commandRoots, skillDiscovery] = await Promise.all([
                listSlashCommandWatchRoots(agent, workingDirectory),
                discoverSkills(workingDirectory),
            ])
            return [...commandRoots, ...skillDiscovery.watchRoots]
        },
    })
}
