import { randomUUID } from 'node:crypto'
import type { RuntimeSessionEventPayload } from '@viby/protocol'
import type { RawJSONLines } from '@/claude/types'
import { runDetachedTask } from '@/utils/runDetachedTask'
import { cleanupUploadDir } from '../modules/common/handlers/uploads'
import type { SessionKeepAliveRuntime, SessionKeepAliveSnapshot } from './runtimeSessionState'
import { isExternalUserMessage, toSessionAlivePayload } from './runtimeSessionState'
import type { MessageContent, MessageMeta, WritableSessionMetadata } from './types'

export interface RuntimeEventChannel {
    send(event: string, payload?: unknown): void
    sendVolatile(event: string, payload?: unknown): void
    request(event: string, payload?: unknown): Promise<unknown>
    disconnect(): void
}

type EventPayload = RuntimeSessionEventPayload

export type RuntimeEventTransportContext = {
    sessionId: string
    channel: RuntimeEventChannel
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

export type SessionRuntimeStateUpdate = {
    state: 'stopping'
    reason?: 'idle-timeout' | 'user-request' | 'shutdown'
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function buildRuntimeMessageMeta(meta?: MessageMeta): MessageMeta {
    return {
        sentFrom: 'runtime',
        ...(meta ?? {}),
    }
}

function resolveCodexAssistantTurnId(body: unknown): string | undefined {
    if (!isRecord(body)) return undefined
    return typeof body.itemId === 'string' && body.itemId.length > 0 ? body.itemId : undefined
}

export function createOutputMessageContent(body: unknown, meta?: MessageMeta): MessageContent {
    return {
        role: 'agent',
        content: { type: 'output', data: body },
        meta: buildRuntimeMessageMeta(meta),
    }
}

export function sendClaudeSessionMessage(
    context: RuntimeEventTransportContext,
    body: RawJSONLines,
    meta?: MessageMeta
): void {
    if (body.type === 'summary') {
        sendClaudeSummary(context, body.summary, body, meta)
        return
    }

    const content: MessageContent = isExternalUserMessage(body)
        ? { role: 'user', content: { type: 'text', text: body.message.content }, meta: { sentFrom: 'runtime' } }
        : createOutputMessageContent(body, meta)

    context.emitSessionMessage(content)
}

function sendClaudeSummary(
    context: RuntimeEventTransportContext,
    summary: string,
    body: RawJSONLines,
    meta?: MessageMeta
): void {
    const updatedAt = Date.now()
    context.setObservedAutoSummary({ text: summary, updatedAt })
    context.updateMetadata((metadata) => ({ ...metadata, summary: { text: summary, updatedAt } }), {
        touchUpdatedAt: false,
    })
    context.emitSessionMessage(createOutputMessageContent({ ...body, isMeta: true, updatedAt }, meta))
}

export function sendOutputMessage(context: RuntimeEventTransportContext, body: unknown, meta?: MessageMeta): void {
    context.emitSessionMessage(createOutputMessageContent(body, meta))
}

export function sendUserMessage(context: RuntimeEventTransportContext, text: string, meta?: MessageMeta): void {
    if (!text) return
    context.emitSessionMessage({
        role: 'user',
        content: { type: 'text', text },
        meta: { sentFrom: 'runtime', ...(meta ?? {}) },
    })
}

export function sendCodexMessage(context: RuntimeEventTransportContext, body: unknown, meta?: MessageMeta): void {
    context.emitSessionMessage({
        role: 'agent',
        content: { type: 'codex', data: body },
        meta: buildRuntimeMessageMeta({ assistantTurnId: resolveCodexAssistantTurnId(body), ...(meta ?? {}) }),
    })
}

export function emitMessagesConsumed(context: RuntimeEventTransportContext, localIds: string[]): void {
    if (localIds.length > 0) context.channel.send('messages-consumed', { sid: context.sessionId, localIds })
}

export function emitMessagesCanceled(context: RuntimeEventTransportContext, localIds: string[]): void {
    if (localIds.length > 0) context.channel.send('messages-canceled', { sid: context.sessionId, localIds })
}

export function sendStreamUpdate(context: RuntimeEventTransportContext, update: SessionStreamClientUpdate): void {
    context.channel.send('stream-update', { sid: context.sessionId, ...update })
}

export function sendSessionRuntimeState(
    context: RuntimeEventTransportContext,
    update: SessionRuntimeStateUpdate
): void {
    context.channel.send('session-runtime-state', { sid: context.sessionId, time: Date.now(), ...update })
}

export function sendSessionEvent(context: RuntimeEventTransportContext, event: EventPayload, id?: string): void {
    context.emitSessionMessage({ role: 'agent', content: { id: id ?? randomUUID(), type: 'event', data: event } })
}

export function keepAlive(
    context: RuntimeEventTransportContext,
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
        ...(runtime?.codexServiceTier !== undefined ? { codexServiceTier: runtime.codexServiceTier } : {}),
        ...(runtime?.collaborationMode !== undefined ? { collaborationMode: runtime.collaborationMode } : {}),
    }
    context.setLastKeepAliveSnapshot(snapshot)
    emitSessionAlive(context, snapshot, { volatile: true })
}

export function emitSessionAlive(
    context: RuntimeEventTransportContext,
    snapshot: SessionKeepAliveSnapshot,
    options?: { volatile?: boolean }
): void {
    const payload = toSessionAlivePayload(context.sessionId, snapshot)
    if (options?.volatile) context.channel.sendVolatile('session-alive', payload)
    else context.channel.send('session-alive', payload)
}

export function sendSessionDeath(context: RuntimeEventTransportContext): void {
    runDetachedTask(
        () => cleanupUploadDir(context.sessionId),
        '[API] Failed to cleanup upload directory on session end'
    )
    context.channel.send('session-end', { sid: context.sessionId, time: Date.now() })
}

export async function flushTransport(
    drainLock: (lock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> }, timeoutMs: number) => Promise<boolean>,
    metadataLock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> },
    agentStateLock: { inLock: <T>(callback: () => Promise<T>) => Promise<T> },
    options?: { timeoutMs?: number }
): Promise<void> {
    const deadlineMs = Date.now() + (options?.timeoutMs ?? 5_000)
    const remainingMs = () => Math.max(0, deadlineMs - Date.now())

    await drainLock(metadataLock, remainingMs())
    await drainLock(agentStateLock, remainingMs())
}
