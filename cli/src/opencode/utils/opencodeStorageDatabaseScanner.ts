import type { OpencodeHookEvent } from '../types'
import {
    type OpencodeStorageDatabase,
    readOpencodeDatabaseMessages,
    readOpencodeDatabaseMessagesUpdatedSince,
    readOpencodeDatabasePartsUpdatedSince,
} from './opencodeStorageDatabase'
import { getString, shouldEmitPart } from './opencodeStorageScannerSupport'

export type OpencodeDatabaseScanState = {
    messageRoles: Map<string, string>
    messageVersion: Map<string, number>
    partVersion: Map<string, number>
    lastMessageUpdate: number
    lastPartUpdate: number
}

export function createOpencodeDatabaseScanState(messageRoles: Map<string, string>): OpencodeDatabaseScanState {
    return {
        messageRoles,
        messageVersion: new Map(),
        partVersion: new Map(),
        lastMessageUpdate: 0,
        lastPartUpdate: 0,
    }
}

export function resetOpencodeDatabaseScanState(state: OpencodeDatabaseScanState): void {
    state.messageVersion.clear()
    state.partVersion.clear()
    state.lastMessageUpdate = 0
    state.lastPartUpdate = 0
}

export function primeOpencodeDatabaseSession(options: {
    db: OpencodeStorageDatabase
    sessionId: string
    referenceTimestampMs: number
    replayClockSkewMs: number
    state: OpencodeDatabaseScanState
    onEvent: (event: OpencodeHookEvent) => void
}): void {
    const replayThresholdMs = options.referenceTimestampMs - options.replayClockSkewMs
    const replayMessageIds = new Set<string>()
    for (const message of readOpencodeDatabaseMessages(options.db, options.sessionId)) {
        options.state.messageVersion.set(message.id, message.timeUpdated)
        options.state.lastMessageUpdate = Math.max(options.state.lastMessageUpdate, message.timeUpdated)
        const role = getString(message.info.role)
        if (role) options.state.messageRoles.set(message.id, role)
        if (message.timeCreated < replayThresholdMs) continue
        replayMessageIds.add(message.id)
        options.onEvent({ event: 'message.updated', payload: { info: message.info }, sessionId: message.sessionId })
    }
    for (const part of readOpencodeDatabasePartsUpdatedSince(options.db, options.sessionId, 0)) {
        options.state.partVersion.set(part.id, part.timeUpdated)
        options.state.lastPartUpdate = Math.max(options.state.lastPartUpdate, part.timeUpdated)
        if (
            !replayMessageIds.has(part.messageId) ||
            !shouldEmitPart(part.part, part.messageId, options.state.messageRoles)
        ) {
            continue
        }
        options.onEvent({ event: 'message.part.updated', payload: { part: part.part }, sessionId: part.sessionId })
    }
}

export function scanOpencodeDatabaseMessagesAndParts(options: {
    db: OpencodeStorageDatabase
    sessionId: string
    state: OpencodeDatabaseScanState
    onEvent: (event: OpencodeHookEvent) => void
}): void {
    for (const message of readOpencodeDatabaseMessagesUpdatedSince(
        options.db,
        options.sessionId,
        options.state.lastMessageUpdate
    )) {
        if (message.timeUpdated <= (options.state.messageVersion.get(message.id) ?? 0)) continue
        options.state.messageVersion.set(message.id, message.timeUpdated)
        options.state.lastMessageUpdate = Math.max(options.state.lastMessageUpdate, message.timeUpdated)
        const role = getString(message.info.role)
        if (role) options.state.messageRoles.set(message.id, role)
        options.onEvent({ event: 'message.updated', payload: { info: message.info }, sessionId: message.sessionId })
    }
    for (const part of readOpencodeDatabasePartsUpdatedSince(
        options.db,
        options.sessionId,
        options.state.lastPartUpdate
    )) {
        if (part.timeUpdated <= (options.state.partVersion.get(part.id) ?? 0)) continue
        options.state.partVersion.set(part.id, part.timeUpdated)
        options.state.lastPartUpdate = Math.max(options.state.lastPartUpdate, part.timeUpdated)
        if (!shouldEmitPart(part.part, part.messageId, options.state.messageRoles)) continue
        options.onEvent({ event: 'message.part.updated', payload: { part: part.part }, sessionId: part.sessionId })
    }
}
