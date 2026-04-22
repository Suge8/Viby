import {
    COMMAND_CAPABILITY_ACTIONS,
    COMMAND_CAPABILITY_EFFECTS,
    COMMAND_CAPABILITY_HIDDEN_TRIGGERS,
    COMMAND_CAPABILITY_INVALIDATION_TRIGGERS,
} from './commandCapabilityRegistry'
import type { SessionDriver } from './sessionDriver'

export type CommandCapabilityKind = 'native_command' | 'native_skill' | 'viby_skill' | 'viby_action'
export type CommandCapabilitySource = 'builtin' | 'user' | 'plugin' | 'project' | 'provider' | 'viby'
export type CommandCapabilityProvider = SessionDriver | 'shared'
export type CommandCapabilitySessionEffect =
    | 'none'
    | 'mutates_context'
    | 'creates_session'
    | 'switches_session'
    | 'replays_history'
export type CommandCapabilitySelectionMode = 'insert' | 'action' | 'disabled'
export type CommandCapabilityActionType = 'open_new_session'

export type CommandCapability = {
    id: string
    trigger: string
    label: string
    description?: string
    kind: CommandCapabilityKind
    source: CommandCapabilitySource
    provider: CommandCapabilityProvider
    sessionEffect: CommandCapabilitySessionEffect
    requiresLifecycleOwner: boolean
    selectionMode: CommandCapabilitySelectionMode
    actionType?: CommandCapabilityActionType
    displayGroup: 'native' | 'skill' | 'session' | 'project'
    riskLevel: 'low' | 'medium' | 'high'
    content?: string
    pluginName?: string
    disabledReason?: string
}

export type CommandCapabilitiesResponse = {
    success: boolean
    revision?: string
    notModified?: boolean
    capabilities?: CommandCapability[]
    error?: string
}

const COMPOUND_COMMAND_TRIGGERS = new Set(
    [
        ...Object.keys(COMMAND_CAPABILITY_ACTIONS),
        ...Object.values(COMMAND_CAPABILITY_EFFECTS).flatMap((effects) => Object.keys(effects ?? {})),
        ...Object.values(COMMAND_CAPABILITY_INVALIDATION_TRIGGERS).flatMap((triggers) => triggers ?? []),
    ].filter((trigger) => trigger.includes(' '))
)

const HIDDEN_COMMAND_TRIGGER_SET = new Set(COMMAND_CAPABILITY_HIDDEN_TRIGGERS.map((trigger) => trigger.toLowerCase()))

function normalizeCommandTrigger(trigger: string): string {
    return trigger.trim().toLowerCase()
}

export function extractLeadingCommandTrigger(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed.startsWith('/')) {
        return null
    }

    const parts = trimmed.split(/\s+/)
    const first = parts[0]
    if (!first) {
        return null
    }

    const second = parts[1]?.toLowerCase()
    if (second) {
        const compoundTrigger = `${first.toLowerCase()} ${second}`
        if (COMPOUND_COMMAND_TRIGGERS.has(compoundTrigger)) {
            return compoundTrigger
        }
    }

    return first
}

export function resolveCommandSessionEffect(
    driver: SessionDriver | null | undefined,
    trigger: string
): CommandCapabilitySessionEffect {
    if (!driver) {
        return 'none'
    }

    const normalizedTrigger = normalizeCommandTrigger(trigger)
    const driverEffects = COMMAND_CAPABILITY_EFFECTS[driver]
    if (!driverEffects) {
        return 'none'
    }

    return driverEffects[normalizedTrigger] ?? 'none'
}

export function resolveCommandCapabilityActionType(trigger: string): CommandCapabilityActionType | undefined {
    return COMMAND_CAPABILITY_ACTIONS[normalizeCommandTrigger(trigger)]
}

export function isHiddenCommandCapabilityTrigger(trigger: string): boolean {
    return HIDDEN_COMMAND_TRIGGER_SET.has(normalizeCommandTrigger(trigger))
}

export function isLifecycleOwnedCommandEffect(effect: CommandCapabilitySessionEffect): boolean {
    return effect === 'creates_session' || effect === 'switches_session' || effect === 'replays_history'
}

export function shouldInvalidateCommandCapabilitiesOnTrigger(
    driver: SessionDriver | null | undefined,
    trigger: string
): boolean {
    if (!driver) {
        return false
    }

    return COMMAND_CAPABILITY_INVALIDATION_TRIGGERS[driver]?.includes(normalizeCommandTrigger(trigger)) ?? false
}
