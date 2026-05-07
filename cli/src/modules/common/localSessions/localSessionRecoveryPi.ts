import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    isLocalSessionPathMatch,
    mapWithConcurrency,
    normalizeLocalSessionPath,
    parseLocalSessionTimestamp,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

type PiCandidateFile = {
    filePath: string
    fallbackPath: string | null
}

type PiVisibleMessage = {
    role: 'user' | 'agent'
    text: string
    createdAt: number | null
}

type PiParsedSession = {
    providerSessionId: string
    path: string
    title: string | null
    summary: string | null
    startedAt: number | null
    updatedAt: number
    messageCount: number
    messages: PiVisibleMessage[]
}

type PiParseState = Pick<PiParsedSession, 'title' | 'summary' | 'startedAt' | 'updatedAt' | 'messageCount' | 'messages'>

const PI_SESSION_SCAN_CONCURRENCY = 8

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getPiSessionsRoot(): string {
    return join(homedir(), '.pi', 'agent', 'sessions')
}

export function encodePiSessionDirectoryName(path: string): string {
    const segments = normalizeLocalSessionPath(path)
        .split(/[\\/]+/)
        .filter(Boolean)
    return `--${segments.join('-')}--`
}

async function readSafeDir(path: string) {
    try {
        return await readdir(path, { withFileTypes: true })
    } catch {
        return []
    }
}

async function readFileMtime(filePath: string): Promise<number> {
    try {
        return (await stat(filePath)).mtimeMs
    } catch {
        return Date.now()
    }
}

async function listJsonlFiles(directory: string, fallbackPath: string | null): Promise<PiCandidateFile[]> {
    const entries = await readSafeDir(directory)
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => ({ filePath: join(directory, entry.name), fallbackPath }))
}

async function listCandidatePiSessionFiles(workingDirectory: string): Promise<PiCandidateFile[]> {
    const root = getPiSessionsRoot()
    const directFiles = await listJsonlFiles(
        join(root, encodePiSessionDirectoryName(workingDirectory)),
        workingDirectory
    )
    if (directFiles.length > 0) {
        return directFiles
    }

    const projectDirs = (await readSafeDir(root)).filter((entry) => entry.isDirectory())
    const nestedFiles = await mapWithConcurrency(projectDirs, PI_SESSION_SCAN_CONCURRENCY, async (entry) => {
        return await listJsonlFiles(join(root, entry.name), null)
    })
    return nestedFiles.flat()
}

function readSessionId(record: Record<string, unknown> | null, filePath: string): string {
    const headerId = getString(record?.id)
    if (headerId) {
        return headerId
    }

    const fileName = basename(filePath, '.jsonl')
    const suffix = fileName.includes('_') ? fileName.slice(fileName.lastIndexOf('_') + 1) : fileName
    return suffix || fileName
}

function readTextParts(content: unknown): string | null {
    if (typeof content === 'string') {
        return trimLocalSessionText(content)
    }
    if (!Array.isArray(content)) {
        return null
    }

    const text = content
        .map((part) => (isRecord(part) && part.type === 'text' ? trimLocalSessionText(part.text) : null))
        .filter((part): part is string => Boolean(part))
        .join('\n\n')
    return trimLocalSessionText(text)
}

function readVisibleMessage(record: Record<string, unknown>): PiVisibleMessage | null {
    if (record.type !== 'message' || !isRecord(record.message)) {
        return null
    }

    const role = record.message.role
    if (role !== 'user' && role !== 'assistant') {
        return null
    }

    const text = readTextParts(record.message.content)
    if (!text) {
        return null
    }

    return {
        role: role === 'user' ? 'user' : 'agent',
        text,
        createdAt: parseLocalSessionTimestamp(record.timestamp ?? record.message.timestamp),
    }
}

function parsePiLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (!trimmed) {
        return null
    }

    try {
        const parsed = JSON.parse(trimmed) as unknown
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function applyVisibleMessage(state: PiParseState, message: PiVisibleMessage, includeMessages: boolean): void {
    state.messageCount += 1
    state.title ??= message.role === 'user' ? message.text : null
    state.summary = message.text
    state.startedAt ??= message.createdAt
    state.updatedAt = message.createdAt ?? state.updatedAt
    if (includeMessages) {
        state.messages.push(message)
    }
}

async function parsePiSessionFile(
    candidate: PiCandidateFile,
    includeMessages: boolean
): Promise<PiParsedSession | null> {
    let content: string
    try {
        content = await readFile(candidate.filePath, 'utf8')
    } catch {
        return null
    }

    const fileUpdatedAt = await readFileMtime(candidate.filePath)
    let header: Record<string, unknown> | null = null
    const state: PiParseState = {
        title: null,
        summary: null,
        startedAt: null,
        updatedAt: fileUpdatedAt,
        messageCount: 0,
        messages: [],
    }

    for (const line of content.split('\n')) {
        const record = parsePiLine(line)
        if (!record) continue
        if (record.type === 'session') {
            header = record
            state.startedAt ??= parseLocalSessionTimestamp(record.timestamp)
            continue
        }

        const message = readVisibleMessage(record)
        if (!message) continue

        applyVisibleMessage(state, message, includeMessages)
    }

    const path = getString(header?.cwd) ?? candidate.fallbackPath
    if (!path) return null

    return {
        providerSessionId: readSessionId(header, candidate.filePath),
        path,
        ...state,
    }
}

function toCatalogEntry(parsed: PiParsedSession): LocalSessionCatalogEntry {
    return createLocalSessionCatalogEntry({
        driver: 'pi',
        providerSessionId: parsed.providerSessionId,
        path: parsed.path,
        title: parsed.title,
        summary: parsed.summary,
        startedAt: parsed.startedAt ?? parsed.updatedAt,
        updatedAt: parsed.updatedAt,
        messageCount: parsed.messageCount,
    })
}

function toSnapshot(parsed: PiParsedSession): LocalSessionExportSnapshot {
    return createLocalSessionSnapshot({
        driver: 'pi',
        providerSessionId: parsed.providerSessionId,
        path: parsed.path,
        title: parsed.title,
        summary: parsed.summary,
        startedAt: parsed.startedAt ?? parsed.updatedAt,
        updatedAt: parsed.updatedAt,
        messages: parsed.messages,
    })
}

export async function listPiLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const candidates = await listCandidatePiSessionFiles(workingDirectory)
    const entries = await mapWithConcurrency(candidates, PI_SESSION_SCAN_CONCURRENCY, async (candidate) => {
        const parsed = await parsePiSessionFile(candidate, false)
        return parsed && isLocalSessionPathMatch(parsed.path, workingDirectory) ? toCatalogEntry(parsed) : null
    })

    return entries.filter((entry): entry is LocalSessionCatalogEntry => Boolean(entry))
}

export async function exportPiLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const candidates = await listCandidatePiSessionFiles(workingDirectory)
    for (const candidate of candidates) {
        const parsed = await parsePiSessionFile(candidate, true)
        if (parsed?.providerSessionId === providerSessionId && isLocalSessionPathMatch(parsed.path, workingDirectory)) {
            return toSnapshot(parsed)
        }
    }

    throw new Error(`Pi local session not found: ${providerSessionId}`)
}
