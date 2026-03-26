import {
    readBrowserStorageJson,
    writeBrowserStorageJson
} from '@/lib/browserStorage'

const SESSION_ENTRY_PREFERENCE_STORAGE = 'local'
const LAST_OPENED_SESSION_STORAGE_KEY = 'viby:last-opened-session'

type LastOpenedSessionRecord = Readonly<{
    sessionId: string
}>

function parseLastOpenedSessionRecord(rawValue: string): LastOpenedSessionRecord | null {
    try {
        const parsed = JSON.parse(rawValue) as Partial<LastOpenedSessionRecord>
        if (typeof parsed.sessionId !== 'string' || parsed.sessionId.length === 0) {
            return null
        }
        return {
            sessionId: parsed.sessionId
        }
    } catch {
        return null
    }
}

export function readLastOpenedSessionId(): string | null {
    return readBrowserStorageJson({
        storage: SESSION_ENTRY_PREFERENCE_STORAGE,
        key: LAST_OPENED_SESSION_STORAGE_KEY,
        parse: parseLastOpenedSessionRecord
    })?.sessionId ?? null
}

export function writeLastOpenedSessionId(sessionId: string): void {
    writeBrowserStorageJson(
        SESSION_ENTRY_PREFERENCE_STORAGE,
        LAST_OPENED_SESSION_STORAGE_KEY,
        { sessionId }
    )
}
