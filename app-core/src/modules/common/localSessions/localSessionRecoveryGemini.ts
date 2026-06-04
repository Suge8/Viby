import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    mapWithConcurrency,
    normalizeLocalSessionPath,
    parseLocalSessionTimestamp,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

type GeminiTranscriptMessage = {
    type?: string
    content?: string
    timestamp?: unknown
    createdAt?: unknown
    time?: {
        created?: unknown
        start?: unknown
        end?: unknown
    }
}

type GeminiTranscript = {
    sessionId?: string
    summary?: string
    startTime?: unknown
    lastUpdated?: unknown
    messages?: GeminiTranscriptMessage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

async function readGeminiFileStats(filePath: string) {
    try {
        return await stat(filePath)
    } catch {
        return null
    }
}

async function readGeminiChatEntries(chatsDir: string) {
    try {
        return await readdir(chatsDir, { withFileTypes: true })
    } catch {
        return []
    }
}

async function resolveGeminiChatsDir(workingDirectory: string): Promise<string | null> {
    const registryPath = join(homedir(), '.gemini', 'projects.json')
    let rawRegistry: string
    try {
        rawRegistry = await readFile(registryPath, 'utf-8')
    } catch {
        return null
    }

    const parsed = JSON.parse(rawRegistry)
    if (!isRecord(parsed) || !isRecord(parsed.projects)) {
        return null
    }

    const candidates = new Set<string>()
    candidates.add(normalizeLocalSessionPath(workingDirectory))
    try {
        candidates.add(normalizeLocalSessionPath(await realpath(workingDirectory)))
    } catch {}

    for (const candidate of candidates) {
        const shortId = parsed.projects[candidate]
        if (typeof shortId === 'string' && shortId.length > 0) {
            return join(homedir(), '.gemini', 'tmp', shortId, 'chats')
        }
    }

    return null
}

async function readGeminiTranscript(filePath: string): Promise<GeminiTranscript | null> {
    try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        if (!isRecord(parsed)) {
            return null
        }
        const messages = Array.isArray(parsed.messages)
            ? parsed.messages.filter((entry): entry is GeminiTranscriptMessage => isRecord(entry))
            : []

        return {
            sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : undefined,
            summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
            startTime: parsed.startTime,
            lastUpdated: parsed.lastUpdated,
            messages,
        }
    } catch {
        return null
    }
}

async function loadGeminiSnapshot(filePath: string, fallbackPath: string): Promise<LocalSessionExportSnapshot | null> {
    const transcript = await readGeminiTranscript(filePath)
    if (!transcript) {
        return null
    }

    const fileUpdatedAt = (await readGeminiFileStats(filePath))?.mtimeMs ?? Date.now()
    const messages = (transcript.messages ?? [])
        .map((message, index) => {
            const text = trimLocalSessionText(message.content)
            if (!text) {
                return null
            }

            if (
                message.type !== 'user' &&
                message.type !== 'gemini' &&
                message.type !== 'assistant' &&
                message.type !== 'model'
            ) {
                return null
            }

            return {
                role: message.type === 'user' ? ('user' as const) : ('agent' as const),
                text,
                createdAt:
                    parseLocalSessionTimestamp(message.createdAt) ??
                    parseLocalSessionTimestamp(message.timestamp) ??
                    parseLocalSessionTimestamp(message.time?.created) ??
                    parseLocalSessionTimestamp(message.time?.start) ??
                    parseLocalSessionTimestamp(message.time?.end) ??
                    fileUpdatedAt + index,
            }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

    const providerSessionId = transcript.sessionId ?? basename(filePath).replace(/\.json$/u, '')
    return createLocalSessionSnapshot({
        driver: 'gemini',
        providerSessionId,
        path: fallbackPath,
        summary: transcript.summary,
        startedAt: parseLocalSessionTimestamp(transcript.startTime) ?? messages[0]?.createdAt ?? fileUpdatedAt,
        updatedAt: parseLocalSessionTimestamp(transcript.lastUpdated) ?? messages.at(-1)?.createdAt ?? fileUpdatedAt,
        messages,
    })
}

async function loadGeminiCatalogEntry(
    filePath: string,
    fallbackPath: string
): Promise<LocalSessionCatalogEntry | null> {
    const transcript = await readGeminiTranscript(filePath)
    if (!transcript) {
        return null
    }

    const fileUpdatedAt = (await readGeminiFileStats(filePath))?.mtimeMs ?? Date.now()
    let title: string | null = null
    let messageCount = 0
    let firstMessageAt: number | null = null
    let lastMessageAt: number | null = null

    for (const message of transcript.messages ?? []) {
        const text = trimLocalSessionText(message.content)
        if (!text) {
            continue
        }
        if (
            message.type !== 'user' &&
            message.type !== 'gemini' &&
            message.type !== 'assistant' &&
            message.type !== 'model'
        ) {
            continue
        }

        messageCount += 1
        const createdAt =
            parseLocalSessionTimestamp(message.createdAt) ??
            parseLocalSessionTimestamp(message.timestamp) ??
            parseLocalSessionTimestamp(message.time?.created) ??
            parseLocalSessionTimestamp(message.time?.start) ??
            parseLocalSessionTimestamp(message.time?.end)
        if (!firstMessageAt && createdAt) {
            firstMessageAt = createdAt
        }
        if (createdAt) {
            lastMessageAt = createdAt
        }
        if (!title && message.type === 'user') {
            title = text
        }
    }

    const providerSessionId = transcript.sessionId ?? basename(filePath).replace(/\.json$/u, '')
    return createLocalSessionCatalogEntry({
        driver: 'gemini',
        providerSessionId,
        path: fallbackPath,
        title,
        summary: transcript.summary,
        startedAt: parseLocalSessionTimestamp(transcript.startTime) ?? firstMessageAt ?? fileUpdatedAt,
        updatedAt: parseLocalSessionTimestamp(transcript.lastUpdated) ?? lastMessageAt ?? fileUpdatedAt,
        messageCount,
    })
}

async function loadGeminiSnapshots(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const chatsDir = await resolveGeminiChatsDir(workingDirectory)
    if (!chatsDir) {
        return []
    }

    const entries = await readGeminiChatEntries(chatsDir)
    const snapshots = await mapWithConcurrency(
        entries.filter((entry) => entry.isFile() && entry.name.startsWith('session-') && entry.name.endsWith('.json')),
        8,
        async (entry) => await loadGeminiCatalogEntry(join(chatsDir, entry.name), workingDirectory)
    )

    return snapshots.filter((snapshot): snapshot is LocalSessionCatalogEntry => Boolean(snapshot))
}

export async function listGeminiLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    return await loadGeminiSnapshots(workingDirectory)
}

export async function exportGeminiLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const chatsDir = await resolveGeminiChatsDir(workingDirectory)
    if (!chatsDir) {
        throw new Error(`Gemini local session not found: ${providerSessionId}`)
    }

    const entries = await readGeminiChatEntries(chatsDir)
    const matchingFiles = entries.filter(
        (entry) => entry.isFile() && entry.name.startsWith('session-') && entry.name.endsWith('.json')
    )
    const snapshot = (
        await mapWithConcurrency(
            matchingFiles,
            8,
            async (entry) => await loadGeminiSnapshot(join(chatsDir, entry.name), workingDirectory)
        )
    ).find((entry): entry is LocalSessionExportSnapshot => {
        if (!entry) {
            return false
        }
        return entry.providerSessionId === providerSessionId
    })
    if (!snapshot) {
        throw new Error(`Gemini local session not found: ${providerSessionId}`)
    }
    return snapshot
}
