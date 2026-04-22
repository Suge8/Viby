import { randomUUID } from 'node:crypto'
import type { RawJSONLines } from '@/claude/types'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import { cleanupUploadDir } from '../modules/common/handlers/uploads'
import type { DriverSwitchSendFailureCode, SessionKeepAliveRuntime, SessionKeepAliveSnapshot } from './apiSessionState'
import { isExternalUserMessage, toSessionAlivePayload } from './apiSessionState'
import type { MessageContent, MessageMeta, SessionPermissionMode, WritableSessionMetadata } from './types'

export interface SessionSocketLike {
    connected: boolean
    emit(...args: unknown[]): unknown
    emitWithAck(...args: unknown[]): Promise<unknown>
    on(...args: unknown[]): unknown
    off(...args: unknown[]): unknown
    connect(): void
    disconnect(): void
    timeout(timeoutMs: number): {
        emitWithAck(...args: unknown[]): Promise<unknown>
    }
    volatile: {
        emit(...args: unknown[]): unknown
    }
}

type EventPayload =
    | { type: 'message'; message: string }
    | { type: 'permission-mode-changed'; mode: SessionPermissionMode }
    | {
          type: 'driver-switch-send-failed'
          stage: 'socket_update' | 'callback_flush'
          code: DriverSwitchSendFailureCode
      }
    | { type: 'ready' }

export type TransportContext = {
    sessionId: string
    socket: SessionSocketLike
    emitSessionMessage: (content: unknown) => void
    getLastKeepAliveSnapshot: () => SessionKeepAliveSnapshot
    setLastKeepAliveSnapshot: (snapshot: SessionKeepAliveSnapshot) => void
    getObservedAutoSummary: () => { text: string; updatedAt: number } | null
    setObservedAutoSummary: (summary: { text: string; updatedAt: number } | null) => void
    updateMetadata: (
        handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
        options?: { touchUpdatedAt?: boolean }
    ) => void
}

export type SessionStreamClientUpdate =
    | { kind: 'append'; assistantTurnId: string; delta: string }
    | { kind: 'clear'; assistantTurnId?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildCliMessageMeta(meta?: MessageMeta): MessageMeta {
    return {
        sentFrom: 'cli',
        ...(meta ?? {}),
    }
}

function resolveCodexAssistantTurnId(body: unknown): string | undefined {
    if (!isRecord(body)) {
        return undefined
    }

    return typeof body.itemId === 'string' && body.itemId.length > 0 ? body.itemId : undefined
}

export function createOutputMessageContent(body: unknown, meta?: MessageMeta): MessageContent {
    return {
        role: 'agent',
        content: {
            type: 'output',
            data: body,
        },
        meta: buildCliMessageMeta(meta),
    }
}

export function sendClaudeSessionMessage(context: TransportContext, body: RawJSONLines, meta?: MessageMeta): void {
    if (body.type === 'summary') {
        const updatedAt = Date.now()
        context.setObservedAutoSummary({
            text: body.summary,
            updatedAt,
        })
        context.updateMetadata(
            (metadata) => ({
                ...metadata,
                summary: {
                    text: body.summary,
                    updatedAt,
                },
            }),
            {
                touchUpdatedAt: false,
            }
        )
        context.emitSessionMessage(
            createOutputMessageContent(
                {
                    ...body,
                    isMeta: true,
                    updatedAt,
                },
                meta
            )
        )
        return
    }

    const content: MessageContent = isExternalUserMessage(body)
        ? {
              role: 'user',
              content: {
                  type: 'text',
                  text: body.message.content,
              },
              meta: {
                  sentFrom: 'cli',
              },
          }
        : createOutputMessageContent(body, meta)

    context.emitSessionMessage(content)
}

export function sendOutputMessage(context: TransportContext, body: unknown, meta?: MessageMeta): void {
    context.emitSessionMessage(createOutputMessageContent(body, meta))
}

export function sendUserMessage(context: TransportContext, text: string, meta?: MessageMeta): void {
    if (!text) {
        return
    }

    context.emitSessionMessage({
        role: 'user',
        content: {
            type: 'text',
            text,
        },
        meta: {
            sentFrom: 'cli',
            ...(meta ?? {}),
        },
    })
}

export function sendCodexMessage(context: TransportContext, body: unknown, meta?: MessageMeta): void {
    context.emitSessionMessage({
        role: 'agent',
        content: {
            type: 'codex',
            data: body,
        },
        meta: buildCliMessageMeta({
            assistantTurnId: resolveCodexAssistantTurnId(body),
            ...(meta ?? {}),
        }),
    })
}

export function sendStreamUpdate(context: TransportContext, update: SessionStreamClientUpdate): void {
    context.socket.emit('stream-update', {
        sid: context.sessionId,
        ...update,
    })
}

export function sendSessionEvent(context: TransportContext, event: EventPayload, id?: string): void {
    context.emitSessionMessage({
        role: 'agent',
        content: {
            id: id ?? randomUUID(),
            type: 'event',
            data: event,
        },
    })
}

export function keepAlive(
    context: TransportContext,
    thinking: boolean,
    mode: 'remote',
    runtime?: SessionKeepAliveRuntime
): void {
    const snapshot: SessionKeepAliveSnapshot = {
        thinking,
        mode,
        ...(runtime?.permissionMode !== undefined ? { permissionMode: runtime.permissionMode } : {}),
        ...(runtime?.model !== undefined ? { model: runtime.model } : {}),
        ...(runtime?.modelReasoningEffort !== undefined ? { modelReasoningEffort: runtime.modelReasoningEffort } : {}),
        ...(runtime?.collaborationMode !== undefined ? { collaborationMode: runtime.collaborationMode } : {}),
    }
    context.setLastKeepAliveSnapshot(snapshot)
    emitSessionAlive(context, snapshot, { volatile: true })
}

export function emitSessionAlive(
    context: TransportContext,
    snapshot: SessionKeepAliveSnapshot,
    options?: { volatile?: boolean }
): void {
    const emitter = options?.volatile ? context.socket.volatile : context.socket
    emitter.emit('session-alive', toSessionAlivePayload(context.sessionId, snapshot))
}

export function sendSessionDeath(context: TransportContext): void {
    runDetachedTask(
        () => cleanupUploadDir(context.sessionId),
        '[API] Failed to cleanup upload directory on session end'
    )
    context.socket.emit('session-end', { sid: context.sessionId, time: Date.now() })
}

export async function waitForConnected(context: TransportContext, timeoutMs: number): Promise<boolean> {
    if (context.socket.connected) {
        return true
    }

    context.socket.connect()

    return await new Promise<boolean>((resolve) => {
        let settled = false

        const cleanup = () => {
            context.socket.off('connect', onConnect)
            clearTimeout(timeout)
        }

        const onConnect = () => {
            if (settled) return
            settled = true
            cleanup()
            resolve(true)
        }

        const timeout = setTimeout(
            () => {
                if (settled) return
                settled = true
                cleanup()
                resolve(false)
            },
            Math.max(0, timeoutMs)
        )

        context.socket.on('connect', onConnect)
    })
}

export async function flushTransport(
    context: TransportContext,
    drainLock: (lock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> }, timeoutMs: number) => Promise<boolean>,
    metadataLock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> },
    agentStateLock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> },
    options?: { timeoutMs?: number }
): Promise<void> {
    const deadlineMs = Date.now() + (options?.timeoutMs ?? 5_000)
    const remainingMs = () => Math.max(0, deadlineMs - Date.now())

    await drainLock(metadataLock, remainingMs())
    await drainLock(agentStateLock, remainingMs())

    if (remainingMs() === 0) {
        return
    }

    const connected = await waitForConnected(context, remainingMs())
    if (!connected) {
        return
    }

    const pingTimeoutMs = remainingMs()
    if (pingTimeoutMs === 0) {
        return
    }

    try {
        await context.socket.timeout(pingTimeoutMs).emitWithAck('ping')
    } catch {}
}
