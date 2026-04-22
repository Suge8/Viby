import { AGENT_FLAVORS } from '@viby/protocol'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { MODEL_OPTIONS, REASONING_EFFORT_OPTIONS } from '@/lib/sessionConfigOptions'
import { type BrowserLocalStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'
import type { AgentType, ModelReasoningEffortSelection, SessionType } from './types'

export type AgentLaunchPreferences = {
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
}

export type NewSessionPreferences = {
    agent: AgentType
    sessionType: SessionType
    yoloMode: boolean
    agentSettings: Partial<Record<AgentType, AgentLaunchPreferences>>
}

const DRAFT_STORAGE_KEY = LOCAL_STORAGE_KEYS.newSessionDraft
const LAST_USED_STORAGE_KEY = LOCAL_STORAGE_KEYS.newSessionLastUsed
const DEFAULT_NEW_SESSION_PREFERENCES: NewSessionPreferences = {
    agent: 'claude',
    sessionType: 'simple',
    yoloMode: false,
    agentSettings: {},
}
const VALID_AGENTS = AGENT_FLAVORS as readonly AgentType[]
const VALID_SESSION_TYPES: SessionType[] = ['simple', 'worktree']

type StoredPreferenceSnapshot = {
    preferences: NewSessionPreferences
    savedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function readStorage(key: BrowserLocalStorageKey): string | null {
    return readBrowserStorageItem('local', key)
}

function removeStorageValue(key: BrowserLocalStorageKey): void {
    removeBrowserStorageItem('local', key)
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

function normalizeModel(agent: AgentType, value: unknown): string {
    if (typeof value !== 'string') {
        return getDefaultAgentLaunchPreferences(agent).model
    }

    const trimmedValue = value.trim()
    if (!trimmedValue) {
        return getDefaultAgentLaunchPreferences(agent).model
    }

    return trimmedValue
}

function normalizeReasoningEffort(agent: AgentType, value: unknown): ModelReasoningEffortSelection {
    if (typeof value !== 'string') {
        return getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
    }

    const trimmedValue = value.trim()
    if (!trimmedValue) {
        return getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
    }

    return trimmedValue as ModelReasoningEffortSelection
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

function normalizeNewSessionPreferences(value: unknown): NewSessionPreferences | null {
    if (!isRecord(value)) {
        return null
    }

    return {
        agent: normalizeAgent(value.agent),
        sessionType: normalizeSessionType(value.sessionType),
        yoloMode: value.yoloMode === true,
        agentSettings: normalizeAgentSettings(value.agentSettings),
    }
}

function normalizeSavedAt(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function parseStoredPreferences(rawValue: string | null): StoredPreferenceSnapshot | null {
    if (!rawValue) {
        return null
    }

    try {
        const parsed = JSON.parse(rawValue) as unknown
        const preferences = normalizeNewSessionPreferences(parsed)
        if (!preferences) {
            return null
        }

        return {
            preferences,
            savedAt: isRecord(parsed) ? normalizeSavedAt(parsed.savedAt) : 0,
        }
    } catch {
        return null
    }
}

function writeStoredPreferences(
    key: BrowserLocalStorageKey,
    preferences: NewSessionPreferences,
    savedAt: number = Date.now()
): void {
    const serializedPreferences = JSON.stringify({
        ...preferences,
        savedAt,
    })

    writeBrowserStorageItem('local', key, serializedPreferences)
}

function pickPreferredSnapshot(
    draftSnapshot: StoredPreferenceSnapshot | null,
    lastUsedSnapshot: StoredPreferenceSnapshot | null
): StoredPreferenceSnapshot | null {
    if (!draftSnapshot) {
        return lastUsedSnapshot
    }

    if (!lastUsedSnapshot) {
        return draftSnapshot
    }

    return draftSnapshot.savedAt >= lastUsedSnapshot.savedAt ? draftSnapshot : lastUsedSnapshot
}

export function loadNewSessionPreferences(): NewSessionPreferences {
    const draftSnapshot = parseStoredPreferences(readStorage(DRAFT_STORAGE_KEY))
    const lastUsedSnapshot = parseStoredPreferences(readStorage(LAST_USED_STORAGE_KEY))

    return pickPreferredSnapshot(draftSnapshot, lastUsedSnapshot)?.preferences ?? DEFAULT_NEW_SESSION_PREFERENCES
}

export function saveNewSessionPreferencesDraft(preferences: NewSessionPreferences): void {
    writeStoredPreferences(DRAFT_STORAGE_KEY, preferences)
}

export function clearNewSessionPreferencesDraft(): void {
    removeStorageValue(DRAFT_STORAGE_KEY)
}

export function commitNewSessionPreferences(preferences: NewSessionPreferences): void {
    writeStoredPreferences(LAST_USED_STORAGE_KEY, preferences)
    clearNewSessionPreferencesDraft()
}
