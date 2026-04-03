import { AGENT_FLAVORS } from '@viby/protocol'
import { MODEL_OPTIONS, REASONING_EFFORT_OPTIONS } from '@/lib/sessionConfigOptions'
import type { AgentType, ModelReasoningEffortSelection, SessionRole, SessionType } from './types'

export type AgentLaunchPreferences = {
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
}

export type NewSessionPreferences = {
    agent: AgentType
    sessionRole: SessionRole
    sessionType: SessionType
    yoloMode: boolean
    agentSettings: Partial<Record<AgentType, AgentLaunchPreferences>>
}

const PREFERENCES_STORAGE_KEY = 'viby:newSession:preferences'
const DEFAULT_NEW_SESSION_PREFERENCES: NewSessionPreferences = {
    agent: 'claude',
    sessionRole: 'normal',
    sessionType: 'simple',
    yoloMode: false,
    agentSettings: {},
}
const VALID_AGENTS = AGENT_FLAVORS as readonly AgentType[]
const VALID_SESSION_ROLES: SessionRole[] = ['normal', 'manager']
const VALID_SESSION_TYPES: SessionType[] = ['simple', 'worktree']

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function getDefaultAgentLaunchPreferences(agent: AgentType): AgentLaunchPreferences {
    return {
        model: MODEL_OPTIONS[agent][0]?.value ?? 'auto',
        modelReasoningEffort: REASONING_EFFORT_OPTIONS[agent][0]?.value ?? 'default',
    }
}

function normalizeAgent(agent: unknown): AgentType {
    if (typeof agent === 'string' && VALID_AGENTS.includes(agent as AgentType)) {
        return agent as AgentType
    }

    return 'claude'
}

function normalizeSessionType(sessionType: unknown): SessionType {
    if (typeof sessionType === 'string' && VALID_SESSION_TYPES.includes(sessionType as SessionType)) {
        return sessionType as SessionType
    }

    return 'simple'
}

function normalizeSessionRole(sessionRole: unknown): SessionRole {
    if (typeof sessionRole === 'string' && VALID_SESSION_ROLES.includes(sessionRole as SessionRole)) {
        return sessionRole as SessionRole
    }

    return 'normal'
}

function normalizeModel(agent: AgentType, value: unknown): string {
    if (typeof value !== 'string') {
        return getDefaultAgentLaunchPreferences(agent).model
    }

    const trimmedValue = value.trim()
    if (!trimmedValue) {
        return getDefaultAgentLaunchPreferences(agent).model
    }

    const optionValues = MODEL_OPTIONS[agent].map((option) => option.value)
    if (optionValues.length === 0) {
        return getDefaultAgentLaunchPreferences(agent).model
    }

    return optionValues.includes(trimmedValue)
        ? trimmedValue
        : getDefaultAgentLaunchPreferences(agent).model
}

function normalizeReasoningEffort(agent: AgentType, value: unknown): ModelReasoningEffortSelection {
    if (typeof value !== 'string') {
        return getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
    }

    const optionValues = REASONING_EFFORT_OPTIONS[agent].map((option) => option.value)
    if (optionValues.length === 0) {
        return getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
    }

    return optionValues.includes(value as ModelReasoningEffortSelection)
        ? value as ModelReasoningEffortSelection
        : getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
}

function normalizeAgentSettings(value: unknown): Partial<Record<AgentType, AgentLaunchPreferences>> {
    if (!isRecord(value)) {
        return {}
    }

    return VALID_AGENTS.reduce<Partial<Record<AgentType, AgentLaunchPreferences>>>((result, agent) => {
        const rawValue = value[agent]
        if (!isRecord(rawValue)) {
            return result
        }

        result[agent] = {
            model: normalizeModel(agent, rawValue.model),
            modelReasoningEffort: normalizeReasoningEffort(agent, rawValue.modelReasoningEffort),
        }
        return result
    }, {})
}

export function loadNewSessionPreferences(): NewSessionPreferences {
    try {
        const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY)
        if (!stored) {
            return DEFAULT_NEW_SESSION_PREFERENCES
        }

        const parsed = JSON.parse(stored) as unknown
        if (!isRecord(parsed)) {
            throw new Error('Invalid new session preferences')
        }

        return {
            agent: normalizeAgent(parsed.agent),
            sessionRole: normalizeSessionRole(parsed.sessionRole),
            sessionType: normalizeSessionType(parsed.sessionType),
            yoloMode: parsed.yoloMode === true,
            agentSettings: normalizeAgentSettings(parsed.agentSettings),
        }
    } catch {
        return DEFAULT_NEW_SESSION_PREFERENCES
    }
}

export function saveNewSessionPreferences(preferences: NewSessionPreferences): void {
    try {
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
        // Ignore storage errors
    }
}
