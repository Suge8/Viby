import type { EventEmitter } from 'node:events'
import type { RuntimeSessionEventPayload } from '@viby/protocol'
import type { RawJSONLines } from '@/claude/types'
import type { AsyncLock } from '@/utils/lock'
import type { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type {
    RuntimeEventChannel,
    RuntimeEventTransportContext,
    SessionRuntimeStateUpdate,
    SessionStreamClientUpdate,
} from './runtimeEventTransport'
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
} from './runtimeEventTransport'
import {
    updateAgentState as applyAgentStateUpdate,
    updateMetadata as applyMetadataUpdate,
    updateMetadataAndWait as applyMetadataUpdateAndWait,
} from './runtimeSessionMutations'
import type { MetadataUpdateOptions, SessionKeepAliveRuntime } from './runtimeSessionState'
import type { AgentState, MessageMeta, Metadata, UserMessage, WritableSessionMetadata } from './types'

type SessionEventPayload = RuntimeSessionEventPayload
type TerminalCloser = { closeAll(): void }

type RecoveryStateLike = {
    metadata: Metadata | null
    metadataVersion: number
    agentState: AgentState | null
    agentStateVersion: number
}

export type RuntimeSessionApi = {
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

export type RuntimeSessionClient = RuntimeSessionApi & {
    readonly sessionId: string
    readonly rpcHandlerManager: RpcHandlerManager
    onUserMessage(callback: (data: UserMessage, localId?: string) => void): void
}

export type EventedRuntimeSessionClient = RuntimeSessionClient & { on: EventEmitter['on'] }

export function createRuntimeSessionApi(options: {
    sessionId: string
    getRecoveryState: () => RecoveryStateLike
    getRuntimeEventTransportContext: () => RuntimeEventTransportContext
    channel: RuntimeEventChannel
    metadataLock: AsyncLock
    agentStateLock: AsyncLock
    rpcHandlerManager: RpcHandlerManager
    terminalManager: TerminalCloser
    drainLock: (lock: AsyncLock, timeoutMs: number) => Promise<boolean>
    sessionStateFlushTimeoutMs: number
}): RuntimeSessionApi {
    const runtimeContext = options.getRuntimeEventTransportContext
    const mutationContext = () => ({
        sessionId: options.sessionId,
        channel: options.channel,
        metadataLock: options.metadataLock,
        agentStateLock: options.agentStateLock,
        recoveryState: options.getRecoveryState(),
    })

    return {
        getObservedAutoSummarySnapshot: () => runtimeContext().getObservedAutoSummary(),
        sendClaudeSessionMessage: (body, meta) => sendClaudeSessionMessage(runtimeContext(), body, meta),
        sendOutputMessage: (body, meta) => sendOutputMessage(runtimeContext(), body, meta),
        sendUserMessage: (text, meta) => sendUserMessage(runtimeContext(), text, meta),
        getMetadataSnapshot: () => options.getRecoveryState().metadata,
        sendCodexMessage: (body, meta) => sendCodexMessage(runtimeContext(), body, meta),
        emitMessagesConsumed: (localIds) => emitMessagesConsumed(runtimeContext(), localIds),
        emitMessagesCanceled: (localIds) => emitMessagesCanceled(runtimeContext(), localIds),
        sendStreamUpdate: (update) => sendStreamUpdate(runtimeContext(), update),
        sendSessionRuntimeState: (update) => sendSessionRuntimeState(runtimeContext(), update),
        sendSessionEvent: (event, id) => sendSessionEvent(runtimeContext(), event, id),
        keepAlive: (thinking, mode, runtime) => keepAlive(runtimeContext(), thinking, mode, runtime),
        sendSessionDeath: () => sendSessionDeath(runtimeContext()),
        updateMetadataAndWait: async (handler, updateOptions) =>
            await applyMetadataUpdateAndWait(mutationContext(), handler, updateOptions),
        updateMetadata: (handler, updateOptions) => applyMetadataUpdate(mutationContext(), handler, updateOptions),
        updateAgentState: (handler) => applyAgentStateUpdate(mutationContext(), handler),
        flushAgentStateUpdates: async (flushOptions) => {
            await options.drainLock(
                options.agentStateLock,
                flushOptions?.timeoutMs ?? options.sessionStateFlushTimeoutMs
            )
        },
        flushKeepAliveSnapshot: async () => {
            emitSessionAlive(runtimeContext(), runtimeContext().getLastKeepAliveSnapshot())
        },
        flush: async (flushOptions) =>
            await flushTransport(
                async (lock, timeoutMs) => await options.drainLock(lock as AsyncLock, timeoutMs),
                options.metadataLock,
                options.agentStateLock,
                flushOptions
            ),
        close: () => {
            options.rpcHandlerManager.disconnect()
            options.terminalManager.closeAll()
            options.channel.disconnect()
        },
    }
}
