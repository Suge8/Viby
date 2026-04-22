import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import type { SessionFileScanEntry, SessionFileScanResult } from '@/modules/common/session/BaseSessionScanner'
import { logger } from '@/ui/logger'
import type { CodexSessionEvent } from './codexEventConverter'
import { asRecord, asString, normalizePath, parseTimestamp } from './codexSessionScannerSupport'

function shouldIncludeSessionPath(fullPath: string, sessionsRoot: string, prefixes: Set<string> | null): boolean {
    if (!prefixes) {
        return true
    }

    const relativePath = relative(sessionsRoot, fullPath)
    if (!relativePath || relativePath.startsWith('..')) {
        return true
    }

    const normalized = relativePath.split(sep).filter(Boolean).join('/')
    if (!normalized) {
        return true
    }

    for (const prefix of prefixes) {
        if (normalized === prefix || normalized.startsWith(`${prefix}/`) || prefix.startsWith(`${normalized}/`)) {
            return true
        }
    }

    return false
}

export async function listSessionFiles(
    dir: string,
    sessionsRoot: string,
    prefixes: Set<string> | null
): Promise<string[]> {
    try {
        const entries = await readdir(dir, { withFileTypes: true })
        const results: string[] = []
        for (const entry of entries) {
            const full = join(dir, entry.name)
            if (!shouldIncludeSessionPath(full, sessionsRoot, prefixes)) {
                continue
            }
            if (entry.isDirectory()) {
                results.push(...(await listSessionFiles(full, sessionsRoot, prefixes)))
                continue
            }
            if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                results.push(full)
            }
        }
        return results
    } catch {
        return []
    }
}

export async function readSessionFile(options: {
    filePath: string
    startLine: number
    sessionMetaParsed: Set<string>
    fileEpochByPath: Map<string, number>
    sessionIdByFile: Map<string, string>
    sessionCwdByFile: Map<string, string>
    sessionTimestampByFile: Map<string, number>
}): Promise<SessionFileScanResult<CodexSessionEvent>> {
    let content: string
    try {
        content = await readFile(options.filePath, 'utf-8')
    } catch {
        return { events: [], nextCursor: options.startLine }
    }

    const events: SessionFileScanEntry<CodexSessionEvent>[] = []
    const lines = content.split('\n')
    const hasTrailingEmpty = lines.length > 0 && lines.at(-1) === ''
    const totalLines = hasTrailingEmpty ? lines.length - 1 : lines.length
    let effectiveStartLine = options.startLine
    if (effectiveStartLine > totalLines) {
        effectiveStartLine = 0
        options.fileEpochByPath.set(options.filePath, (options.fileEpochByPath.get(options.filePath) ?? 0) + 1)
    }

    const parseFrom = options.sessionMetaParsed.has(options.filePath) ? effectiveStartLine : 0
    for (let index = parseFrom; index < lines.length; index += 1) {
        const trimmed = lines[index].trim()
        if (!trimmed) {
            continue
        }
        try {
            const parsed = JSON.parse(trimmed) as CodexSessionEvent
            if (parsed?.type === 'session_meta') {
                updateSessionMeta(options, parsed)
            }
            if (index >= effectiveStartLine) {
                events.push({ event: parsed, lineIndex: index })
            }
        } catch (error) {
            logger.debug(`[CODEX_SESSION_SCANNER] Failed to parse line: ${error}`)
        }
    }

    return { events, nextCursor: totalLines }
}

export async function sortFilesByMtime(files: string[]): Promise<string[]> {
    const entries = await Promise.all(
        files.map(async (file) => {
            try {
                const stats = await stat(file)
                return { file, mtimeMs: stats.mtimeMs }
            } catch {
                return { file, mtimeMs: 0 }
            }
        })
    )

    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.file)
}

function updateSessionMeta(
    options: {
        filePath: string
        sessionMetaParsed: Set<string>
        sessionIdByFile: Map<string, string>
        sessionCwdByFile: Map<string, string>
        sessionTimestampByFile: Map<string, number>
    },
    parsed: CodexSessionEvent
): void {
    const payload = asRecord(parsed.payload)
    const sessionId = payload ? asString(payload.id) : null
    if (sessionId) {
        options.sessionIdByFile.set(options.filePath, sessionId)
    }

    const sessionCwd = payload ? asString(payload.cwd) : null
    const normalizedCwd = sessionCwd ? normalizePath(sessionCwd) : null
    if (normalizedCwd) {
        options.sessionCwdByFile.set(options.filePath, normalizedCwd)
    }

    const rawTimestamp = payload ? payload.timestamp : null
    const sessionTimestamp = payload ? parseTimestamp(payload.timestamp) : null
    if (sessionTimestamp !== null) {
        options.sessionTimestampByFile.set(options.filePath, sessionTimestamp)
    }
    logger.debug(
        `[CODEX_SESSION_SCANNER] Session meta: file=${options.filePath} cwd=${sessionCwd ?? 'none'} ` +
            `normalizedCwd=${normalizedCwd ?? 'none'} timestamp=${rawTimestamp ?? 'none'} parsedTs=${sessionTimestamp ?? 'none'}`
    )
    options.sessionMetaParsed.add(options.filePath)
}
