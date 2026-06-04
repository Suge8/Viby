import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import { type RawJSONLines, RawJSONLinesSchema } from '@/claude/types'
import { getProjectPath } from '@/claude/utils/path'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    mapWithConcurrency,
    parseLocalSessionTimestamp,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

const INTERNAL_CLAUDE_EVENT_TYPES = new Set(['file-history-snapshot', 'change', 'queue-operation'])

async function readClaudeFileStats(filePath: string) {
    try {
        return await stat(filePath)
    } catch {
        return null
    }
}

async function readClaudeProjectEntries(projectDir: string) {
    try {
        return await readdir(projectDir, { withFileTypes: true })
    } catch {
        return []
    }
}

function extractClaudeText(value: unknown): string | null {
    if (typeof value === 'string') {
        return trimLocalSessionText(value)
    }

    if (Array.isArray(value)) {
        const combined = value
            .map((entry) => extractClaudeText(entry))
            .filter((entry): entry is string => Boolean(entry))
            .join('\n\n')
        return trimLocalSessionText(combined)
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        if (typeof record.text === 'string') {
            return trimLocalSessionText(record.text)
        }
        if ('content' in record) {
            return extractClaudeText(record.content)
        }
    }

    return null
}

async function readClaudeSessionLog(filePath: string): Promise<RawJSONLines[]> {
    let content: string
    try {
        content = await readFile(filePath, 'utf-8')
    } catch {
        return []
    }

    const events: RawJSONLines[] = []
    for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) {
            continue
        }

        try {
            const parsed = JSON.parse(trimmed) as Record<string, unknown>
            if (typeof parsed.type === 'string' && INTERNAL_CLAUDE_EVENT_TYPES.has(parsed.type)) {
                continue
            }
            const validated = RawJSONLinesSchema.safeParse(parsed)
            if (validated.success) {
                events.push(validated.data)
            }
        } catch {}
    }

    return events
}

async function loadClaudeSnapshot(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot | null> {
    const filePath = join(getProjectPath(workingDirectory), `${providerSessionId}.jsonl`)
    const fileStats = await readClaudeFileStats(filePath)
    if (!fileStats) {
        return null
    }

    const events = await readClaudeSessionLog(filePath)
    let summary: string | null = null
    const messages: Array<{ role: 'user' | 'agent'; text: string; createdAt?: number | null }> = []

    for (const event of events) {
        const createdAt = parseLocalSessionTimestamp(event.timestamp)
        if (event.type === 'summary') {
            summary = event.summary
            continue
        }

        if (event.type === 'user') {
            const text = extractClaudeText(event.message.content)
            if (text) {
                messages.push({ role: 'user', text, createdAt })
            }
            continue
        }

        if (event.type === 'assistant' && event.message) {
            const text = extractClaudeText(event.message.content)
            if (text) {
                messages.push({ role: 'agent', text, createdAt })
            }
        }
    }

    const firstTimestamp = messages[0]?.createdAt ?? null
    const lastTimestamp = messages.at(-1)?.createdAt ?? null

    return createLocalSessionSnapshot({
        driver: 'claude',
        providerSessionId,
        path: workingDirectory,
        summary,
        startedAt: firstTimestamp ?? fileStats.mtimeMs,
        updatedAt: lastTimestamp ?? fileStats.mtimeMs,
        messages,
    })
}

async function loadClaudeCatalogEntry(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionCatalogEntry | null> {
    const filePath = join(getProjectPath(workingDirectory), `${providerSessionId}.jsonl`)
    const fileStats = await readClaudeFileStats(filePath)
    if (!fileStats) {
        return null
    }

    const events = await readClaudeSessionLog(filePath)
    let summary: string | null = null
    let title: string | null = null
    let messageCount = 0
    let startedAt: number | null = null
    let updatedAt: number | null = null

    for (const event of events) {
        const createdAt = parseLocalSessionTimestamp(event.timestamp)
        if (event.type === 'summary') {
            summary = event.summary
            continue
        }

        if (event.type !== 'user' && event.type !== 'assistant') {
            continue
        }

        const text =
            event.type === 'user'
                ? extractClaudeText(event.message.content)
                : event.message
                  ? extractClaudeText(event.message.content)
                  : null
        if (!text) {
            continue
        }

        messageCount += 1
        if (!startedAt && createdAt) {
            startedAt = createdAt
        }
        if (createdAt) {
            updatedAt = createdAt
        }
        if (!title && event.type === 'user') {
            title = text
        }
    }

    return createLocalSessionCatalogEntry({
        driver: 'claude',
        providerSessionId,
        path: workingDirectory,
        title,
        summary,
        startedAt: startedAt ?? fileStats.mtimeMs,
        updatedAt: updatedAt ?? fileStats.mtimeMs,
        messageCount,
    })
}

export async function listClaudeLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const projectDir = getProjectPath(workingDirectory)
    const entries = await readClaudeProjectEntries(projectDir)
    const catalog = await mapWithConcurrency(
        entries.filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl')),
        8,
        async (entry) => {
            const providerSessionId = entry.name.slice(0, -'.jsonl'.length)
            return await loadClaudeCatalogEntry(workingDirectory, providerSessionId)
        }
    )

    return catalog.filter((entry): entry is LocalSessionCatalogEntry => Boolean(entry))
}

export async function exportClaudeLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const snapshot = await loadClaudeSnapshot(workingDirectory, providerSessionId)
    if (!snapshot) {
        throw new Error(`Claude local session not found: ${providerSessionId}`)
    }
    return snapshot
}
