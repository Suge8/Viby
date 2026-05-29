import type { CliSessionEventPayload } from '@viby/protocol'
import type { RawJSONLines } from '@/claude/types'
import type { TerminalManager } from '@/terminal/TerminalManager'
import type { AsyncLock } from '@/utils/lock'
import {
    updateAgentState as applyAgentStateUpdate,
    updateMetadata as applyMetadataUpdate,
    updateMetadataAndWait as applyMetadataUpdateAndWait,
} from './apiSessionMutations'
import type { MetadataUpdateOptions, SessionKeepAliveRuntime, SessionKeepAliveSnapshot } from './apiSessionState'
import type {
    SessionRuntimeStateUpdate,
    SessionSocketLike,
    SessionStreamClientUpdate,
    TransportContext,
} from './apiSessionTransport'
import {
    emitMessagesCanceled,
    emitMessagesConsumed,
    emitSessionAlive,
    flushTransport,
    keepAlive,
    sendClaudeSessionMessage,
    sendCodexMessage,
    sendOutputMessage,
    sendSessionDeath,
    sendSessionEvent,
    sendSessionRuntimeState,
    sendStreamUpdate,
    sendUserMessage,
    waitForConnected,
} from './apiSessionTransport'
import type { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type { AgentState, MessageMeta, Metadata, UserMessage, WritableSessionMetadata } from './types'

type SessionEventPayload = CliSessionEventPayload

type RecoveryStateLike = {
    metadata: Metadata | null
    metadataVersion: number
    agentState: AgentState | null
    agentStateVersion: number
}

export type ApiSessionPublicApi = {
    getObservedAutoSummarySnapshot(): { text: string; updatedAt: number } | null
    sendClaudeSessionMessage(body: RawJSONLines, meta?: MessageMeta): void
    sendOutputMessage(body: unknown, meta?: MessageMeta): void
    sendUserMessage(text: string, meta?: MessageMeta): void
    getMetadataSnapshot(): Metadata | null
    sendCodexMessage(body: unknown, meta?: MessageMeta): void
    emitMessagesConsumed(localIds: string[]): void
    emitMessagesCanceled(localIds: string[]): void
    sendStreamUpdate(update: SessionStreamClientUpdate): void
    sendSessionRuntimeState(update: SessionRuntimeStateUpdate): void
    sendSessionEvent(event: SessionEventPayload, id?: string): void
    keepAlive(thinking: boolean, mode: 'remote', runtime?: SessionKeepAliveRuntime): void
    sendSessionDeath(): void
    updateMetadataAndWait(
        handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
        options?: MetadataUpdateOptions
    ): Promise<void>
    updateMetadata(
        handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
        options?: MetadataUpdateOptions
    ): void
    updateAgentState(handler: (state: AgentState) => AgentState): void
    flushAgentStateUpdates(options?: { timeoutMs?: number }): Promise<void>
    flushKeepAliveSnapshot(options?: { timeoutMs?: number }): Promise<void>
    flush(options?: { timeoutMs?: number }): Promise<void>
    close(): void
}

export function createApiSessionPublicApi(options: {
    sessionId: string
    getRecoveryState: () => RecoveryStateLike
    getTransportContext: () => TransportContext
    socket: SessionSocketLike
    metadataLock: AsyncLock
    agentStateLock: AsyncLock
    rpcHandlerManager: RpcHandlerManager
    terminalManager: TerminalManager
    drainLock: (lock: AsyncLock, timeoutMs: number) => Promise<boolean>
    sessionStateFlushTimeoutMs: number
}): ApiSessionPublicApi {
    return {
        getObservedAutoSummarySnapshot: () => options.getTransportContext().getObservedAutoSummary(),
        sendClaudeSessionMessage: (body, meta) => sendClaudeSessionMessage(options.getTransportContext(), body, meta),
        sendOutputMessage: (body, meta) => sendOutputMessage(options.getTransportContext(), body, meta),
        sendUserMessage: (text, meta) => sendUserMessage(options.getTransportContext(), text, meta),
        getMetadataSnapshot: () => options.getRecoveryState().metadata,
        sendCodexMessage: (body, meta) => sendCodexMessage(options.getTransportContext(), body, meta),
        emitMessagesConsumed: (localIds) => emitMessagesConsumed(options.getTransportContext(), localIds),
        emitMessagesCanceled: (localIds) => emitMessagesCanceled(options.getTransportContext(), localIds),
        sendStreamUpdate: (update) => sendStreamUpdate(options.getTransportContext(), update),
        sendSessionRuntimeState: (update) => sendSessionRuntimeState(options.getTransportContext(), update),
        sendSessionEvent: (event, id) => sendSessionEvent(options.getTransportContext(), event, id),
        keepAlive: (thinking, mode, runtime) => keepAlive(options.getTransportContext(), thinking, mode, runtime),
        sendSessionDeath: () => sendSessionDeath(options.getTransportContext()),
        updateMetadataAndWait: async (handler, updateOptions) =>
            await applyMetadataUpdateAndWait(
                {
                    sessionId: options.sessionId,
                    socket: options.socket,
                    metadataLock: options.metadataLock,
                    agentStateLock: options.agentStateLock,
                    recoveryState: options.getRecoveryState(),
                },
                handler,
                updateOptions
            ),
        updateMetadata: (handler, updateOptions) =>
            applyMetadataUpdate(
                {
                    sessionId: options.sessionId,
                    socket: options.socket,
                    metadataLock: options.metadataLock,
                    agentStateLock: options.agentStateLock,
                    recoveryState: options.getRecoveryState(),
                },
                handler,
                updateOptions
            ),
        updateAgentState: (handler) =>
            applyAgentStateUpdate(
                {
                    sessionId: options.sessionId,
                    socket: options.socket,
                    metadataLock: options.metadataLock,
                    agentStateLock: options.agentStateLock,
                    recoveryState: options.getRecoveryState(),
                },
                handler
            ),
        flushAgentStateUpdates: async (flushOptions) => {
            await options.drainLock(
                options.agentStateLock,
                flushOptions?.timeoutMs ?? options.sessionStateFlushTimeoutMs
            )
        },
        flushKeepAliveSnapshot: async (flushOptions) => {
            const timeoutMs = flushOptions?.timeoutMs ?? options.sessionStateFlushTimeoutMs
            const connected = await waitForConnected(options.getTransportContext(), timeoutMs)
            if (!connected) {
                return
            }
            emitSessionAlive(options.getTransportContext(), options.getTransportContext().getLastKeepAliveSnapshot())
        },
        flush: async (flushOptions) =>
            await flushTransport(
                options.getTransportContext(),
                async (lock, timeoutMs) => await options.drainLock(lock as AsyncLock, timeoutMs),
                options.metadataLock,
                options.agentStateLock,
                flushOptions
            ),
        close: () => {
            options.rpcHandlerManager.onSocketDisconnect()
            options.terminalManager.closeAll()
            options.socket.disconnect()
        },
    }
}
