import { AGENT_FLAVORS } from '@viby/protocol'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'
import type { AgentType, SessionType } from './types'

export type NewSessionPreferences = {
    agent: AgentType
    sessionType: SessionType
    yoloMode: boolean
}

const PREFERENCE_VERSION = 2
const DRAFT_STORAGE_KEY = LOCAL_STORAGE_KEYS.newSessionDraft
const LAST_USED_STORAGE_KEY = LOCAL_STORAGE_KEYS.newSessionLastUsed
const DEFAULT_NEW_SESSION_PREFERENCES: NewSessionPreferences = {
    agent: 'claude',
    sessionType: 'simple',
    yoloMode: false,
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

function normalizeAgent(agent: unknown): AgentType {
    return typeof agent === 'string' && VALID_AGENTS.includes(agent as AgentType) ? (agent as AgentType) : 'claude'
}

function normalizeSessionType(sessionType: unknown): SessionType {
    return typeof sessionType === 'string' && VALID_SESSION_TYPES.includes(sessionType as SessionType)
        ? (sessionType as SessionType)
        : 'simple'
}

function normalizeSavedAt(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function readStorage(key: BrowserLocalStorageKey): string | null {
    return readBrowserStorageItem('local', key)
}

function removeStorageValue(key: BrowserLocalStorageKey): void {
    removeBrowserStorageItem('local', key)
}

function parseStoredPreferences(rawValue: string | null): StoredPreferenceSnapshot | null {
    if (!rawValue) return null

    try {
        const parsed = JSON.parse(rawValue) as unknown
        if (!isRecord(parsed) || parsed.version !== PREFERENCE_VERSION) return null

        return {
            preferences: {
                agent: normalizeAgent(parsed.agent),
                sessionType: normalizeSessionType(parsed.sessionType),
                yoloMode: parsed.yoloMode === true,
            },
            savedAt: normalizeSavedAt(parsed.savedAt),
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
    writeBrowserStorageItem('local', key, JSON.stringify({ ...preferences, version: PREFERENCE_VERSION, savedAt }))
}

function pickPreferredSnapshot(
    draftSnapshot: StoredPreferenceSnapshot | null,
    lastUsedSnapshot: StoredPreferenceSnapshot | null
): StoredPreferenceSnapshot | null {
    if (!draftSnapshot) return lastUsedSnapshot
    if (!lastUsedSnapshot) return draftSnapshot
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
