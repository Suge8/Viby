import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import {
    getOpencodeDatabaseSession,
    listOpencodeDatabaseSessions,
    type OpencodeDbMessage,
    type OpencodeStorageDatabase,
    readOpencodeDatabaseMessages,
    readOpencodeDatabasePartsByMessage,
} from '@/opencode/utils/opencodeStorageDatabase'
import { getNumber, getString } from '@/opencode/utils/opencodeStorageScannerSupport'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    isLocalSessionPathMatch,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

export type OpencodeDatabaseSessionInfo = {
    id: string
    directory: string
    timeCreated: number | null
}

type DatabaseMessageEntry = {
    role: 'user' | 'agent'
    text: string
    createdAt: number
    updatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function resolveOpencodeDatabaseSessionInfo(
    db: OpencodeStorageDatabase,
    workingDirectory: string,
    providerSessionId: string
): OpencodeDatabaseSessionInfo | null {
    const session = getOpencodeDatabaseSession(db, providerSessionId)
    if (!session || !isLocalSessionPathMatch(session.directory, workingDirectory)) {
        return null
    }
    return { id: session.id, directory: session.directory, timeCreated: session.timeCreated }
}

export function listOpencodeDatabaseLocalSessionEntries(
    db: OpencodeStorageDatabase,
    workingDirectory: string
): { entries: LocalSessionCatalogEntry[]; sessionIds: Set<string> } {
    const entries: LocalSessionCatalogEntry[] = []
    const sessionIds = new Set<string>()
    for (const info of listOpencodeDatabaseSessions(db, workingDirectory)) {
        sessionIds.add(info.id)
        entries.push(loadOpencodeDatabaseCatalogEntry(db, info))
    }
    return { entries, sessionIds }
}

export function loadOpencodeDatabaseCatalogEntry(
    db: OpencodeStorageDatabase,
    sessionInfo: OpencodeDatabaseSessionInfo
): LocalSessionCatalogEntry {
    const messages = readOpencodeDatabaseMessages(db, sessionInfo.id)
    const updatedAt = messages.reduce(
        (current, message) => Math.max(current, message.timeUpdated),
        sessionInfo.timeCreated ?? Date.now()
    )
    return createLocalSessionCatalogEntry({
        driver: 'opencode',
        providerSessionId: sessionInfo.id,
        path: sessionInfo.directory,
        startedAt: sessionInfo.timeCreated ?? updatedAt,
        updatedAt,
        messageCount: messages.length,
    })
}

export function loadOpencodeDatabaseSnapshot(
    db: OpencodeStorageDatabase,
    sessionInfo: OpencodeDatabaseSessionInfo
): LocalSessionExportSnapshot {
    const entries = readOpencodeDatabaseMessages(db, sessionInfo.id).flatMap((message) =>
        createDatabaseMessageEntry(db, message)
    )
    const updatedAt = entries.reduce(
        (current, entry) => Math.max(current, entry.updatedAt),
        sessionInfo.timeCreated ?? Date.now()
    )
    return createLocalSessionSnapshot({
        driver: 'opencode',
        providerSessionId: sessionInfo.id,
        path: sessionInfo.directory,
        startedAt: sessionInfo.timeCreated ?? entries[0]?.createdAt ?? updatedAt,
        updatedAt,
        messages: entries.map((entry) => ({ role: entry.role, text: entry.text, createdAt: entry.createdAt })),
    })
}

function createDatabaseMessageEntry(db: OpencodeStorageDatabase, message: OpencodeDbMessage): DatabaseMessageEntry[] {
    const role = getString(message.info.role)
    if (!role) {
        return []
    }
    const textEntry = collectOpencodeDatabaseMessageText(db, message, role)
    const text = trimLocalSessionText(textEntry.text)
    return text
        ? [
              {
                  role: role === 'user' ? 'user' : 'agent',
                  text,
                  createdAt: message.timeCreated,
                  updatedAt: textEntry.updatedAt,
              },
          ]
        : []
}

function collectOpencodeDatabaseMessageText(
    db: OpencodeStorageDatabase,
    message: OpencodeDbMessage,
    role: string
): { text: string | null; updatedAt: number } {
    const visibleParts = readOpencodeDatabasePartsByMessage(db, message.id)
        .flatMap((part) => {
            if (getString(part.part.type) !== 'text') return []
            const text = trimLocalSessionText(part.part.text)
            if (!text) return []
            const time = isRecord(part.part.time) ? part.part.time : null
            if (role !== 'user' && part.part.synthetic !== true && getNumber(time?.end) === null) return []
            return [{ text, createdAt: getNumber(time?.end) ?? getNumber(time?.start) ?? part.timeCreated }]
        })
        .sort((left, right) => left.createdAt - right.createdAt)

    return {
        text: visibleParts.length > 0 ? visibleParts.map((part) => part.text).join('\n\n') : null,
        updatedAt: visibleParts.at(-1)?.createdAt ?? message.timeUpdated,
    }
}
