import type { AgentFlavor } from './modes'

export const TEAM_MEMBER_ROLE_PROTOTYPES = [
    'planner',
    'architect',
    'implementer',
    'debugger',
    'reviewer',
    'verifier',
    'designer'
] as const

export const TEAM_ROLE_SOURCES = ['builtin', 'custom'] as const

export const TEAM_ROLE_ID_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$'
export const TEAM_PRESET_SCHEMA_VERSION = 1 as const

type TeamBuiltInRoleDefault = {
    name: string
    providerFlavor: AgentFlavor
    isolationMode: 'simple' | 'worktree'
}

export const TEAM_BUILTIN_ROLE_DEFAULTS = {
    planner: {
        name: 'planner',
        providerFlavor: 'claude',
        isolationMode: 'simple'
    },
    architect: {
        name: 'architect',
        providerFlavor: 'claude',
        isolationMode: 'simple'
    },
    implementer: {
        name: 'implementer',
        providerFlavor: 'codex',
        isolationMode: 'worktree'
    },
    debugger: {
        name: 'debugger',
        providerFlavor: 'codex',
        isolationMode: 'worktree'
    },
    reviewer: {
        name: 'reviewer',
        providerFlavor: 'codex',
        isolationMode: 'simple'
    },
    verifier: {
        name: 'verifier',
        providerFlavor: 'codex',
        isolationMode: 'simple'
    },
    designer: {
        name: 'designer',
        providerFlavor: 'gemini',
        isolationMode: 'simple'
    }
} as const satisfies Record<(typeof TEAM_MEMBER_ROLE_PROTOTYPES)[number], TeamBuiltInRoleDefault>

export type TeamMemberRolePrototypeId = (typeof TEAM_MEMBER_ROLE_PROTOTYPES)[number]
export type TeamRoleSourceId = (typeof TEAM_ROLE_SOURCES)[number]
