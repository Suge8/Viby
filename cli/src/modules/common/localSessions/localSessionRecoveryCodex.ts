import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import { type CodexSessionEvent, convertCodexEvent } from '@/codex/utils/codexEventConverter'
import { listSessionFiles, readSessionFile, sortFilesByMtime } from '@/codex/utils/codexSessionScannerFs'
import { normalizePath, parseTimestamp } from '@/codex/utils/codexSessionScannerSupport'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    mapWithConcurrency,
} from './localSessionRecoverySupport'

type ParsedCodexFile = {
    sessionId: string | null
    cwd: string | null
    sessionTimestamp: number | null
    events: CodexSessionEvent[]
    fileUpdatedAt: number
}

type TimedCacheEntry<T> = {
    expiresAt: number
    promise: Promise<T>
}

const CODEX_PARSED_FILES_TTL_MS = 5_000
const parsedCodexFilesCache = new Map<string, TimedCacheEntry<ParsedCodexFile[]>>()

async function readCodexFileStats(filePath: string) {
    try {
        return await stat(filePath)
    } catch {
        return null
    }
}

function getCodexSessionsRoot(): string {
    const codexHomeDir = process.env.CODEX_HOME || join(homedir(), '.codex')
    return join(codexHomeDir, 'sessions')
}

function getTimedCacheValue<T>(
    store: Map<string, TimedCacheEntry<T>>,
    key: string,
    ttlMs: number,
    load: () => Promise<T>
): Promise<T> {
    const now = Date.now()
    const cached = store.get(key)
    if (cached && cached.expiresAt > now) {
        return cached.promise
    }

    const promise = load().catch((error) => {
        if (store.get(key)?.promise === promise) {
            store.delete(key)
        }
        throw error
    })
    store.set(key, {
        expiresAt: now + ttlMs,
        promise,
    })
    return promise
}

async function loadParsedCodexFiles(): Promise<ParsedCodexFile[]> {
    const sessionsRoot = getCodexSessionsRoot()
    const files = await sortFilesByMtime(await listSessionFiles(sessionsRoot, sessionsRoot, null))
    return await mapWithConcurrency(files, 8, async (filePath) => await readCodexFile(filePath))
}

async function getParsedCodexFiles(): Promise<ParsedCodexFile[]> {
    const sessionsRoot = getCodexSessionsRoot()
    return await getTimedCacheValue(
        parsedCodexFilesCache,
        sessionsRoot,
        CODEX_PARSED_FILES_TTL_MS,
        loadParsedCodexFiles
    )
}

async function readCodexFile(filePath: string): Promise<ParsedCodexFile> {
    const sessionMetaParsed = new Set<string>()
    const fileEpochByPath = new Map<string, number>()
    const sessionIdByFile = new Map<string, string>()
    const sessionCwdByFile = new Map<string, string>()
    const sessionTimestampByFile = new Map<string, number>()
    const parsed = await readSessionFile({
        filePath,
        startLine: 0,
        sessionMetaParsed,
        fileEpochByPath,
        sessionIdByFile,
        sessionCwdByFile,
        sessionTimestampByFile,
    })

    const fileUpdatedAt = (await readCodexFileStats(filePath))?.mtimeMs ?? Date.now()
    return {
        sessionId: sessionIdByFile.get(filePath) ?? null,
        cwd: sessionCwdByFile.get(filePath) ?? null,
        sessionTimestamp: sessionTimestampByFile.get(filePath) ?? null,
        events: parsed.events.map((entry) => entry.event),
        fileUpdatedAt,
    }
}

function createCodexSnapshot(parsed: ParsedCodexFile, fallbackPath: string): LocalSessionExportSnapshot | null {
    if (!parsed.sessionId) {
        return null
    }

    const messages: Array<{ role: 'user' | 'agent'; text: string; createdAt?: number | null }> = []
    for (const event of parsed.events) {
        const converted = convertCodexEvent(event)
        if (!converted) {
            continue
        }

        const createdAt = parseTimestamp(event.timestamp)
        if (converted.userMessage) {
            messages.push({
                role: 'user',
                text: converted.userMessage,
                createdAt,
            })
        } else if (converted.message?.type === 'message') {
            messages.push({
                role: 'agent',
                text: converted.message.message,
                createdAt,
            })
        }
    }

    return createLocalSessionSnapshot({
        driver: 'codex',
        providerSessionId: parsed.sessionId,
        path: parsed.cwd ?? fallbackPath,
        startedAt: parsed.sessionTimestamp ?? messages[0]?.createdAt ?? parsed.fileUpdatedAt,
        updatedAt: messages.at(-1)?.createdAt ?? parsed.fileUpdatedAt,
        messages,
    })
}

function createCodexCatalogEntry(parsed: ParsedCodexFile, fallbackPath: string): LocalSessionCatalogEntry | null {
    if (!parsed.sessionId) {
        return null
    }

    let title: string | null = null
    let messageCount = 0
    let startedAt = parsed.sessionTimestamp
    let updatedAt: number | null = null

    for (const event of parsed.events) {
        const converted = convertCodexEvent(event)
        if (!converted) {
            continue
        }

        const createdAt = parseTimestamp(event.timestamp)
        if (converted.userMessage) {
            messageCount += 1
            title ??= converted.userMessage
            startedAt ??= createdAt
            if (createdAt !== null) {
                updatedAt = createdAt
            }
            continue
        }

        if (converted.message?.type === 'message') {
            messageCount += 1
            startedAt ??= createdAt
            if (createdAt !== null) {
                updatedAt = createdAt
            }
        }
    }

    return createLocalSessionCatalogEntry({
        driver: 'codex',
        providerSessionId: parsed.sessionId,
        path: parsed.cwd ?? fallbackPath,
        title,
        startedAt: startedAt ?? parsed.fileUpdatedAt,
        updatedAt: updatedAt ?? parsed.fileUpdatedAt,
        messageCount,
    })
}

async function loadCodexCatalogEntries(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const targetCwd = normalizePath(workingDirectory)
    const entriesBySessionId = new Map<string, LocalSessionCatalogEntry>()
    const parsedFiles = await getParsedCodexFiles()

    for (const parsed of parsedFiles) {
        if (!parsed.sessionId || parsed.cwd !== targetCwd) {
            continue
        }

        const entry = createCodexCatalogEntry(parsed, workingDirectory)
        if (!entry) {
            continue
        }

        const current = entriesBySessionId.get(entry.providerSessionId)
        if (!current || entry.updatedAt > current.updatedAt) {
            entriesBySessionId.set(entry.providerSessionId, entry)
        }
    }

    return [...entriesBySessionId.values()]
}

async function loadCodexSnapshots(workingDirectory: string): Promise<LocalSessionExportSnapshot[]> {
    const targetCwd = normalizePath(workingDirectory)
    const snapshotsBySessionId = new Map<string, LocalSessionExportSnapshot>()
    const parsedFiles = await getParsedCodexFiles()

    for (const parsed of parsedFiles) {
        if (!parsed.sessionId || parsed.cwd !== targetCwd) {
            continue
        }

        const snapshot = createCodexSnapshot(parsed, workingDirectory)
        if (!snapshot) {
            continue
        }

        const current = snapshotsBySessionId.get(snapshot.providerSessionId)
        if (!current || snapshot.updatedAt > current.updatedAt) {
            snapshotsBySessionId.set(snapshot.providerSessionId, snapshot)
        }
    }

    return [...snapshotsBySessionId.values()]
}

export async function listCodexLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    return await loadCodexCatalogEntries(workingDirectory)
}

export async function exportCodexLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const snapshot = (await loadCodexSnapshots(workingDirectory)).find(
        (entry) => entry.providerSessionId === providerSessionId
    )
    if (!snapshot) {
        throw new Error(`Codex local session not found: ${providerSessionId}`)
    }
    return snapshot
}
