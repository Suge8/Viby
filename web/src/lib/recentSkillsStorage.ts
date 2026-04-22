import { readBrowserStorageItem, writeBrowserStorageJson } from '@/lib/browserStorage'
import { LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

const RECENT_SKILLS_KEY = LOCAL_STORAGE_KEYS.recentSkills

export type RecentSkillsMap = Record<string, number>

function safeParseJson(value: string): unknown {
    try {
        return JSON.parse(value) as unknown
    } catch {
        return null
    }
}

export function readRecentSkillsMap(): RecentSkillsMap {
    const raw = readBrowserStorageItem('local', RECENT_SKILLS_KEY)
    if (!raw) {
        return {}
    }

    const parsed = safeParseJson(raw)
    if (!parsed || typeof parsed !== 'object') {
        return {}
    }

    const record = parsed as Record<string, unknown>
    const result: RecentSkillsMap = {}
    for (const [key, value] of Object.entries(record)) {
        if (typeof key !== 'string' || key.trim().length === 0) {
            continue
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            continue
        }
        result[key] = value
    }
    return result
}

export function writeRecentSkillsMap(value: RecentSkillsMap): void {
    writeBrowserStorageJson('local', RECENT_SKILLS_KEY, value)
}
