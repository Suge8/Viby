import { resolve } from 'node:path'
import type {
    LocalSessionCatalogEntry,
    LocalSessionExportSnapshot,
    LocalSessionTranscriptMessage,
    SessionDriver,
} from '@viby/protocol/types'

type DraftLocalSessionMessage = {
    role: LocalSessionTranscriptMessage['role']
    text: string
    createdAt?: number | null
}

type CreateLocalSessionSnapshotInput = {
    driver: SessionDriver
    providerSessionId: string
    path: string
    title?: string | null
    summary?: string | null
    startedAt?: number | null
    updatedAt?: number | null
    messages: DraftLocalSessionMessage[]
}

type CreateLocalSessionCatalogEntryInput = {
    driver: SessionDriver
    providerSessionId: string
    path: string
    title?: string | null
    summary?: string | null
    startedAt?: number | null
    updatedAt?: number | null
    messageCount?: number | null
}

function coalesceTimestamp(...values: Array<number | null | undefined>): number | null {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
    }
    return null
}

export function normalizeLocalSessionPath(value: string): string {
    const normalized = resolve(value.trim())
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function isLocalSessionPathMatch(
    currentPath: string | null | undefined,
    targetPath: string | null | undefined
): boolean {
    if (!currentPath || !targetPath) {
        return false
    }
    return normalizeLocalSessionPath(currentPath) === normalizeLocalSessionPath(targetPath)
}

export function parseLocalSessionTimestamp(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Date.parse(value)
        return Number.isNaN(parsed) ? null : parsed
    }
    return null
}

export function trimLocalSessionText(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function deriveSnapshotTitle(
    title: string | null | undefined,
    summary: string | null | undefined,
    providerSessionId: string
): string {
    const normalizedTitle = trimLocalSessionText(title)
    if (normalizedTitle) {
        return normalizedTitle
    }

    const normalizedSummary = trimLocalSessionText(summary)
    if (normalizedSummary) {
        return normalizedSummary
    }

    return providerSessionId
}

export function createLocalSessionCatalogEntry(input: CreateLocalSessionCatalogEntryInput): LocalSessionCatalogEntry {
    const normalizedPath = normalizeLocalSessionPath(input.path)
    const summary = trimLocalSessionText(input.summary) ?? undefined
    const updatedAt = coalesceTimestamp(input.updatedAt, input.startedAt, Date.now()) ?? Date.now()
    const startedAt = Math.min(coalesceTimestamp(input.startedAt, updatedAt, Date.now()) ?? updatedAt, updatedAt)

    return {
        driver: input.driver,
        providerSessionId: input.providerSessionId,
        title: deriveSnapshotTitle(input.title, summary, input.providerSessionId),
        summary,
        path: normalizedPath,
        startedAt,
        updatedAt,
        messageCount:
            typeof input.messageCount === 'number' && Number.isFinite(input.messageCount)
                ? Math.max(0, Math.trunc(input.messageCount))
                : undefined,
    }
}

export function createLocalSessionSnapshot(input: CreateLocalSessionSnapshotInput): LocalSessionExportSnapshot {
    const preparedMessages = input.messages
        .map((message, index) => {
            const text = trimLocalSessionText(message.text)
            if (!text) {
                return null
            }
            return {
                role: message.role,
                text,
                createdAt: message.createdAt,
                index,
            }
        })
        .filter((message): message is NonNullable<typeof message> => Boolean(message))

    const fallbackStartAt = coalesceTimestamp(input.startedAt, input.updatedAt, Date.now()) ?? Date.now()
    const normalizedMessages = preparedMessages
        .map((message) => ({
            role: message.role,
            text: message.text,
            createdAt:
                coalesceTimestamp(message.createdAt, fallbackStartAt + message.index) ??
                fallbackStartAt + message.index,
            index: message.index,
        }))
        .sort((left, right) => left.createdAt - right.createdAt || left.index - right.index)
        .map(({ index: _index, ...message }) => message)

    const firstMessageAt = normalizedMessages[0]?.createdAt ?? null
    const lastMessageAt = normalizedMessages.at(-1)?.createdAt ?? null
    const startedAt = coalesceTimestamp(input.startedAt, firstMessageAt, input.updatedAt, Date.now()) ?? Date.now()
    const updatedAtBase = coalesceTimestamp(input.updatedAt, lastMessageAt, startedAt, Date.now()) ?? Date.now()
    const updatedAt = Math.max(updatedAtBase, lastMessageAt ?? updatedAtBase)
    const firstUserMessage = normalizedMessages.find((message) => message.role === 'user')?.text ?? null
    const entry = createLocalSessionCatalogEntry({
        driver: input.driver,
        providerSessionId: input.providerSessionId,
        path: input.path,
        title: trimLocalSessionText(input.title) ?? firstUserMessage,
        summary: input.summary,
        startedAt: Math.min(startedAt, firstMessageAt ?? startedAt, updatedAt),
        updatedAt,
        messageCount: normalizedMessages.length,
    })

    return {
        ...entry,
        messages: normalizedMessages,
    }
}

export function toLocalSessionCatalogEntry(snapshot: LocalSessionExportSnapshot): LocalSessionCatalogEntry {
    const { messages: _messages, ...entry } = snapshot
    return entry
}

export async function mapWithConcurrency<T, U>(
    values: readonly T[],
    limit: number,
    map: (value: T, index: number) => Promise<U>
): Promise<U[]> {
    if (values.length === 0) {
        return []
    }

    const results = new Array<U>(values.length)
    let nextIndex = 0
    const workerCount = Math.max(1, Math.min(limit, values.length))

    async function runWorker(): Promise<void> {
        while (nextIndex < values.length) {
            const currentIndex = nextIndex
            nextIndex += 1
            results[currentIndex] = await map(values[currentIndex], currentIndex)
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
    return results
}
