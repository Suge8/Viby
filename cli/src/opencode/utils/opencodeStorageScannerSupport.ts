import type { Dirent } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { isObject } from '@viby/protocol'
import { logger } from '@/ui/logger'
import type { OpencodeHookEvent } from '../types'

export type ParsedSessionInfo = {
    id: string | null
    directory: string | null
    timeCreated: number | null
}

type StorageScanRuntime = {
    storageDir: string
    onEvent: (event: OpencodeHookEvent) => void
    messageRoles: Map<string, string>
    messageFileMtime: Map<string, number>
    partFileMtime: Map<string, number>
}

export function resolveOpencodeStorageDir(): string {
    const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
    return join(base, 'opencode', 'storage')
}

export function normalizePath(value: string): string {
    const resolved = resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function filenameToId(filePath: string): string | null {
    if (!filePath.endsWith('.json')) {
        return null
    }
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    const name = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath
    return name.slice(0, -5) || null
}

export function getString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim()
    }
    return null
}

export function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function getMessageTimestamp(info: Record<string, unknown> | null, mtime: number | null): number | null {
    if (info) {
        const time = isObject(info.time) ? (info.time as Record<string, unknown>) : null
        const createdAt = time ? getNumber(time.created) : null
        if (createdAt !== null) {
            return createdAt
        }
    }
    return mtime
}

export async function readSessionInfo(filePath: string): Promise<ParsedSessionInfo | null> {
    const record = await readJsonRecord(filePath)
    if (!record) {
        return null
    }
    const time = isObject(record.time) ? (record.time as Record<string, unknown>) : null
    return {
        id: getString(record.id),
        directory: getString(record.directory),
        timeCreated: time ? getNumber(time.created) : null,
    }
}

export async function listSessionInfoFiles(storageDir: string): Promise<string[]> {
    const sessionRoot = join(storageDir, 'session')
    const entries = await safeReadDir(sessionRoot)
    const results: string[] = []

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue
        }
        results.push(...(await listJsonFiles(join(sessionRoot, entry.name))))
    }

    return results
}

export async function listJsonFiles(dirPath: string): Promise<string[]> {
    const entries = await safeReadDir(dirPath)
    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => join(dirPath, entry.name))
}

export async function safeReadDir(dirPath: string): Promise<Dirent[]> {
    try {
        return await readdir(dirPath, { withFileTypes: true })
    } catch {
        return [] as Dirent[]
    }
}

export async function readJsonRecord(filePath: string): Promise<Record<string, unknown> | null> {
    try {
        const raw = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch (error) {
        logger.debug(`[opencode-storage] Failed to read ${filePath}: ${error}`)
        return null
    }
}

export async function readMtime(filePath: string): Promise<number | null> {
    try {
        const stats = await stat(filePath)
        return stats.mtimeMs
    } catch {
        return null
    }
}

export function shouldEmitPart(
    part: Record<string, unknown>,
    messageId: string,
    messageRoles: Map<string, string>
): boolean {
    const partType = getString(part.type)
    if (!partType) {
        return false
    }
    if (partType === 'text') {
        const text = getString(part.text)
        if (!text) {
            return false
        }
        const role = messageRoles.get(messageId)
        if (role === 'user' || part.synthetic === true) {
            return true
        }
        const time = isObject(part.time) ? (part.time as Record<string, unknown>) : null
        return (time ? getNumber(time.end) : null) !== null
    }
    return partType === 'tool'
}

export async function primeSessionFiles(
    runtime: StorageScanRuntime,
    sessionId: string,
    referenceTimestampMs: number,
    replayClockSkewMs: number
): Promise<void> {
    const messageDir = join(runtime.storageDir, 'message', sessionId)
    const messageFiles = await listJsonFiles(messageDir)
    const messageIds: string[] = []
    const replayMessageIds = new Set<string>()
    const replayThresholdMs = referenceTimestampMs - replayClockSkewMs

    for (const filePath of messageFiles) {
        const mtime = await readMtime(filePath)
        if (mtime !== null) {
            runtime.messageFileMtime.set(filePath, mtime)
        }
        const info = await readJsonRecord(filePath)
        const messageId = getString(info?.id) ?? filenameToId(filePath)
        if (messageId) {
            messageIds.push(messageId)
            const role = getString(info?.role)
            if (role) {
                runtime.messageRoles.set(messageId, role)
            }
        }
        const timestamp = getMessageTimestamp(info, mtime)
        if (messageId && info && timestamp !== null && timestamp >= replayThresholdMs) {
            replayMessageIds.add(messageId)
            const eventSessionId = getString(info.sessionID) ?? sessionId
            runtime.onEvent({
                event: 'message.updated',
                payload: { info },
                sessionId: eventSessionId || undefined,
            })
        }
    }

    for (const messageId of messageIds) {
        const partDir = join(runtime.storageDir, 'part', messageId)
        const partFiles = await listJsonFiles(partDir)
        for (const partPath of partFiles) {
            const mtime = await readMtime(partPath)
            if (mtime !== null) {
                runtime.partFileMtime.set(partPath, mtime)
            }
            if (!replayMessageIds.has(messageId)) {
                continue
            }
            const part = await readJsonRecord(partPath)
            if (!part || !shouldEmitPart(part, messageId, runtime.messageRoles)) {
                continue
            }
            const eventSessionId = getString(part.sessionID) ?? sessionId
            runtime.onEvent({
                event: 'message.part.updated',
                payload: { part },
                sessionId: eventSessionId || undefined,
            })
        }
    }
}

export async function scanMessagesAndParts(runtime: StorageScanRuntime, sessionId: string): Promise<void> {
    const messageDir = join(runtime.storageDir, 'message', sessionId)
    const messageFiles = await listJsonFiles(messageDir)
    const messageIds: string[] = []

    for (const filePath of messageFiles) {
        const messageIdFromPath = filenameToId(filePath)
        if (messageIdFromPath) {
            messageIds.push(messageIdFromPath)
        }

        const mtime = await readMtime(filePath)
        if (mtime === null || mtime <= (runtime.messageFileMtime.get(filePath) ?? 0)) {
            continue
        }

        const info = await readJsonRecord(filePath)
        runtime.messageFileMtime.set(filePath, mtime)
        if (!info) {
            continue
        }

        const messageId = getString(info.id) ?? messageIdFromPath
        if (messageId) {
            const role = getString(info.role)
            if (role) {
                runtime.messageRoles.set(messageId, role)
            }
        }

        const eventSessionId = getString(info.sessionID) ?? sessionId
        runtime.onEvent({
            event: 'message.updated',
            payload: { info },
            sessionId: eventSessionId || undefined,
        })
    }

    for (const messageId of messageIds) {
        const partDir = join(runtime.storageDir, 'part', messageId)
        const partFiles = await listJsonFiles(partDir)

        for (const partPath of partFiles) {
            const mtime = await readMtime(partPath)
            if (mtime === null || mtime <= (runtime.partFileMtime.get(partPath) ?? 0)) {
                continue
            }

            const part = await readJsonRecord(partPath)
            runtime.partFileMtime.set(partPath, mtime)
            if (!part || !shouldEmitPart(part, messageId, runtime.messageRoles)) {
                continue
            }

            const eventSessionId = getString(part.sessionID) ?? sessionId
            runtime.onEvent({
                event: 'message.part.updated',
                payload: { part },
                sessionId: eventSessionId || undefined,
            })
        }
    }
}
