import { open, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import { type CodexSessionEvent, convertCodexEvent } from '@/codex/utils/codexEventConverter'
import { listSessionFiles, readSessionFile } from '@/codex/utils/codexSessionScannerFs'
import { asRecord, asString, normalizePath, parseTimestamp } from '@/codex/utils/codexSessionScannerSupport'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    mapWithConcurrency,
} from './localSessionRecoverySupport'

type CodexFileMeta = {
    filePath: string
    sessionId: string
    cwd: string
    sessionTimestamp: number | null
    fileUpdatedAt: number
}

type ParsedCodexFile = CodexFileMeta & {
    events: CodexSessionEvent[]
}

type TimedCacheEntry<T> = {
    expiresAt: number
    promise: Promise<T>
}

const CODEX_FILE_META_TTL_MS = 5_000
const CODEX_SCAN_CONCURRENCY = 8
const CODEX_FIRST_LINE_CHUNK_BYTES = 16 * 1024
const CODEX_FIRST_LINE_MAX_BYTES = 1024 * 1024
const codexFileMetaCache = new Map<string, TimedCacheEntry<CodexFileMeta[]>>()

async function readFileMtime(filePath: string): Promise<number> {
    try {
        return (await stat(filePath)).mtimeMs
    } catch {
        return Date.now()
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
    store.set(key, { expiresAt: now + ttlMs, promise })
    return promise
}

async function readFirstLine(filePath: string): Promise<string | null> {
    try {
        const file = await open(filePath, 'r')
        try {
            let offset = 0
            let content = ''
            const buffer = Buffer.allocUnsafe(CODEX_FIRST_LINE_CHUNK_BYTES)
            while (offset < CODEX_FIRST_LINE_MAX_BYTES) {
                const { bytesRead } = await file.read(buffer, 0, buffer.length, offset)
                if (!bytesRead) return content || null

                const chunk = buffer.subarray(0, bytesRead).toString('utf8')
                const newlineIndex = chunk.indexOf('\n')
                if (newlineIndex >= 0) return content + chunk.slice(0, newlineIndex)

                content += chunk
                offset += bytesRead
            }
            return content || null
        } finally {
            await file.close().catch(() => undefined)
        }
    } catch {
        return null
    }
}

async function readCodexFileMeta(filePath: string): Promise<CodexFileMeta | null> {
    const line = await readFirstLine(filePath)
    if (!line) {
        return null
    }

    try {
        const parsed = JSON.parse(line) as CodexSessionEvent
        const payload = parsed.type === 'session_meta' ? asRecord(parsed.payload) : null
        const sessionId = payload ? asString(payload.id) : null
        const cwd = payload ? asString(payload.cwd) : null
        if (!sessionId || !cwd) {
            return null
        }
        const sessionTimestamp = parseTimestamp(payload?.timestamp) ?? parseTimestamp(parsed.timestamp)
        return {
            filePath,
            sessionId,
            cwd: normalizePath(cwd),
            sessionTimestamp,
            fileUpdatedAt: sessionTimestamp ?? (await readFileMtime(filePath)),
        }
    } catch {
        return null
    }
}

async function loadCodexFileMetas(): Promise<CodexFileMeta[]> {
    const sessionsRoot = getCodexSessionsRoot()
    const files = await listSessionFiles(sessionsRoot, sessionsRoot, null)
    const metas = await mapWithConcurrency(files, CODEX_SCAN_CONCURRENCY, readCodexFileMeta)
    return metas
        .filter((meta): meta is CodexFileMeta => Boolean(meta))
        .sort((left, right) => right.fileUpdatedAt - left.fileUpdatedAt)
}

async function getCodexFileMetas(): Promise<CodexFileMeta[]> {
    const sessionsRoot = getCodexSessionsRoot()
    return await getTimedCacheValue(codexFileMetaCache, sessionsRoot, CODEX_FILE_META_TTL_MS, loadCodexFileMetas)
}

async function readCodexFile(meta: CodexFileMeta): Promise<ParsedCodexFile> {
    const parsed = await readSessionFile({
        filePath: meta.filePath,
        startLine: 0,
        sessionMetaParsed: new Set<string>(),
        fileEpochByPath: new Map<string, number>(),
        sessionIdByFile: new Map<string, string>(),
        sessionCwdByFile: new Map<string, string>(),
        sessionTimestampByFile: new Map<string, number>(),
    })
    return { ...meta, events: parsed.events.map((entry) => entry.event) }
}

function createCodexSnapshot(parsed: ParsedCodexFile): LocalSessionExportSnapshot | null {
    const messages: Array<{ role: 'user' | 'agent'; text: string; createdAt?: number | null }> = []
    for (const event of parsed.events) {
        const converted = convertCodexEvent(event)
        if (!converted) continue

        const createdAt = parseTimestamp(event.timestamp)
        if (converted.userMessage) {
            messages.push({ role: 'user', text: converted.userMessage, createdAt })
        } else if (converted.message?.type === 'message') {
            messages.push({ role: 'agent', text: converted.message.message, createdAt })
        }
    }

    return createLocalSessionSnapshot({
        driver: 'codex',
        providerSessionId: parsed.sessionId,
        path: parsed.cwd,
        startedAt: parsed.sessionTimestamp ?? messages[0]?.createdAt ?? parsed.fileUpdatedAt,
        updatedAt: messages.at(-1)?.createdAt ?? parsed.fileUpdatedAt,
        messages,
    })
}

function collectCodexCatalogEvent(
    state: { title: string | null; messageCount: number; startedAt: number | null; updatedAt: number | null },
    event: CodexSessionEvent
): void {
    const converted = convertCodexEvent(event)
    if (!converted) return

    const createdAt = parseTimestamp(event.timestamp)
    if (converted.userMessage) {
        state.messageCount += 1
        state.title ??= converted.userMessage
        state.startedAt ??= createdAt
        state.updatedAt = createdAt ?? state.updatedAt
        return
    }
    if (converted.message?.type === 'message') {
        state.messageCount += 1
        state.startedAt ??= createdAt
        state.updatedAt = createdAt ?? state.updatedAt
    }
}

async function createCodexCatalogEntry(meta: CodexFileMeta): Promise<LocalSessionCatalogEntry> {
    const state = {
        title: null as string | null,
        messageCount: 0,
        startedAt: meta.sessionTimestamp,
        updatedAt: null as number | null,
    }
    try {
        for (const line of (await readFile(meta.filePath, 'utf8')).split('\n')) {
            if (!line.includes('"event_msg"')) continue
            collectCodexCatalogEvent(state, JSON.parse(line) as CodexSessionEvent)
        }
    } catch {
        state.updatedAt = meta.fileUpdatedAt
    }

    return createLocalSessionCatalogEntry({
        driver: 'codex',
        providerSessionId: meta.sessionId,
        path: meta.cwd,
        title: state.title,
        startedAt: state.startedAt ?? meta.fileUpdatedAt,
        updatedAt: state.updatedAt ?? meta.fileUpdatedAt,
        messageCount: state.messageCount,
    })
}

function pickLatestBySession<T extends { providerSessionId: string; updatedAt: number }>(items: T[]): T[] {
    const bySessionId = new Map<string, T>()
    for (const item of items) {
        const current = bySessionId.get(item.providerSessionId)
        if (!current || item.updatedAt > current.updatedAt) {
            bySessionId.set(item.providerSessionId, item)
        }
    }
    return [...bySessionId.values()]
}

async function loadMatchingCodexMetas(workingDirectory: string): Promise<CodexFileMeta[]> {
    const targetCwd = normalizePath(workingDirectory)
    return (await getCodexFileMetas()).filter((meta) => meta.cwd === targetCwd)
}

export async function listCodexLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const entries = await mapWithConcurrency(
        await loadMatchingCodexMetas(workingDirectory),
        CODEX_SCAN_CONCURRENCY,
        createCodexCatalogEntry
    )
    return pickLatestBySession(entries)
}

export async function exportCodexLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const targetCwd = normalizePath(workingDirectory)
    const metas = (await getCodexFileMetas()).filter(
        (meta) => meta.cwd === targetCwd && meta.sessionId === providerSessionId
    )
    const snapshots = (await mapWithConcurrency(metas, CODEX_SCAN_CONCURRENCY, readCodexFile))
        .map(createCodexSnapshot)
        .filter((entry): entry is LocalSessionExportSnapshot => Boolean(entry))
    const snapshot = pickLatestBySession(snapshots)[0]
    if (!snapshot) {
        throw new Error(`Codex local session not found: ${providerSessionId}`)
    }
    return snapshot
}
