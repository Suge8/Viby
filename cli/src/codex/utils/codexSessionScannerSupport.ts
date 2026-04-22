import { resolve } from 'node:path'
import type { CodexSessionEvent } from './codexEventConverter'

export type PendingEvents = {
    events: CodexSessionEvent[]
    fileSessionId: string | null
}

export type Candidate = {
    sessionId: string
    score: number
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

export function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function parseTimestamp(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value === 'string' && value.length > 0) {
        const parsed = Date.parse(value)
        return Number.isNaN(parsed) ? null : parsed
    }
    return null
}

export function normalizePath(value: string): string {
    const resolved = resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function getSessionDatePrefixes(referenceTimestampMs: number, windowMs: number): Set<string> {
    const startDate = new Date(referenceTimestampMs - windowMs)
    const endDate = new Date(referenceTimestampMs + windowMs)
    const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
    const prefixes = new Set<string>()

    while (current <= last) {
        const year = String(current.getFullYear())
        const month = String(current.getMonth() + 1).padStart(2, '0')
        const day = String(current.getDate()).padStart(2, '0')
        prefixes.add(`${year}/${month}/${day}`)
        current.setDate(current.getDate() + 1)
    }

    return prefixes
}

export function getCandidateForFile(options: {
    filePath: string
    sessionIdByFile: Map<string, string>
    sessionCwdByFile: Map<string, string>
    sessionTimestampByFile: Map<string, number>
    targetCwd: string | null
    referenceTimestampMs: number
    sessionStartWindowMs: number
}): Candidate | null {
    const sessionId = options.sessionIdByFile.get(options.filePath)
    if (!sessionId) {
        return null
    }

    const fileCwd = options.sessionCwdByFile.get(options.filePath)
    if (options.targetCwd && fileCwd !== options.targetCwd) {
        return null
    }

    const sessionTimestamp = options.sessionTimestampByFile.get(options.filePath)
    if (sessionTimestamp === undefined || sessionTimestamp < options.referenceTimestampMs) {
        return null
    }

    const diff = sessionTimestamp - options.referenceTimestampMs
    if (diff > options.sessionStartWindowMs) {
        return null
    }

    return { sessionId, score: diff }
}

export function getRecentActivityCandidateForFile(options: {
    filePath: string
    newCount: number
    sessionIdByFile: Map<string, string>
    sessionCwdByFile: Map<string, string>
    targetCwd: string | null
}): Candidate | null {
    if (options.newCount <= 0) {
        return null
    }

    const sessionId = options.sessionIdByFile.get(options.filePath)
    if (!sessionId) {
        return null
    }

    const fileCwd = options.sessionCwdByFile.get(options.filePath)
    if (options.targetCwd && fileCwd !== options.targetCwd) {
        return null
    }

    return { sessionId, score: 0 }
}

export function getFilesForSession(
    sessionId: string,
    sessionIdByFile: Map<string, string>,
    watchedFiles: string[]
): string[] {
    const matches: string[] = []
    for (const [filePath, storedSessionId] of sessionIdByFile.entries()) {
        if (storedSessionId === sessionId) {
            matches.push(filePath)
        }
    }
    if (matches.length > 0) {
        return matches
    }
    const suffix = `-${sessionId}.jsonl`
    return watchedFiles.filter((filePath) => filePath.endsWith(suffix))
}

export function appendPendingEvents(
    pendingEventsByFile: Map<string, PendingEvents>,
    filePath: string,
    events: CodexSessionEvent[],
    fileSessionId: string | null
): void {
    if (events.length === 0) {
        return
    }
    const existing = pendingEventsByFile.get(filePath)
    if (existing) {
        existing.events.push(...events)
        if (!existing.fileSessionId && fileSessionId) {
            existing.fileSessionId = fileSessionId
        }
        return
    }
    pendingEventsByFile.set(filePath, {
        events: [...events],
        fileSessionId,
    })
}

export function emitCodexSessionEvents(options: {
    events: CodexSessionEvent[]
    fileSessionId: string | null
    activeSessionId: string | null
    onEvent: (event: CodexSessionEvent) => void
}): number {
    let emittedForFile = 0
    for (const event of options.events) {
        const payload = asRecord(event.payload)
        const payloadSessionId = payload ? asString(payload.id) : null
        const eventSessionId = payloadSessionId ?? options.fileSessionId ?? null

        if (options.activeSessionId && eventSessionId && eventSessionId !== options.activeSessionId) {
            continue
        }

        options.onEvent(event)
        emittedForFile += 1
    }
    return emittedForFile
}

export function flushPendingEventsForSession(options: {
    pendingEventsByFile: Map<string, PendingEvents>
    sessionId: string
    onEvent: (event: CodexSessionEvent) => void
}): number {
    if (options.pendingEventsByFile.size === 0) {
        return 0
    }

    let emitted = 0
    for (const [filePath, pending] of options.pendingEventsByFile.entries()) {
        const matches =
            (pending.fileSessionId && pending.fileSessionId === options.sessionId) ||
            filePath.endsWith(`-${options.sessionId}.jsonl`)
        if (!matches) {
            continue
        }
        emitted += emitCodexSessionEvents({
            events: pending.events,
            fileSessionId: pending.fileSessionId,
            activeSessionId: options.sessionId,
            onEvent: options.onEvent,
        })
    }

    options.pendingEventsByFile.clear()
    return emitted
}
