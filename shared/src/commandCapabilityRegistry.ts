import type { SessionDriver } from './sessionDriver'

type CommandCapabilityActionType = 'open_new_session'
type CommandCapabilitySessionEffect =
    | 'none'
    | 'mutates_context'
    | 'creates_session'
    | 'switches_session'
    | 'replays_history'
type CommandEffectMap = Partial<Record<string, CommandCapabilitySessionEffect>>

export const COMMAND_CAPABILITY_ACTIONS: Readonly<Partial<Record<string, CommandCapabilityActionType>>> = {
    '/new': 'open_new_session',
    '/clear': 'open_new_session',
}

export const COMMAND_CAPABILITY_HIDDEN_TRIGGERS = ['/resume', '/chat resume'] as const

export const COMMAND_CAPABILITY_INVALIDATION_TRIGGERS: Partial<Record<SessionDriver, readonly string[]>> = {
    gemini: ['/commands reload', '/skills reload'],
}

export const COMMAND_CAPABILITY_EFFECTS: Partial<Record<SessionDriver, CommandEffectMap>> = {
    claude: {
        '/clear': 'creates_session',
        '/new': 'creates_session',
        '/resume': 'switches_session',
    },
    codex: {
        '/clear': 'creates_session',
        '/new': 'creates_session',
        '/resume': 'replays_history',
        '/fork': 'creates_session',
        '/rewind': 'replays_history',
    },
    gemini: {
        '/chat resume': 'replays_history',
    },
    opencode: {},
    cursor: {},
    pi: {},
}
