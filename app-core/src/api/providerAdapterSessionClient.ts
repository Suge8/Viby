import { EventEmitter } from 'node:events'
import { type ProviderAdapterInput, parseProviderAdapterInput } from '@viby/protocol/providerAdapterProtocol'
import { AsyncLock } from '@/utils/lock'
import { TitleManager } from '../agent/titleManager'
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers'
import { ProviderAdapterEventChannel } from './providerAdapterEventChannel'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import type { RuntimeEventTransportContext } from './runtimeEventTransport'
import { createRuntimeMessageDelivery } from './runtimeMessageDelivery'
import { createRuntimeSessionApi, type RuntimeSessionApi, type RuntimeSessionClient } from './runtimeSessionClient'
import { RuntimeSessionRecoveryOwner } from './runtimeSessionRecoveryOwner'
import {
    createInitialKeepAliveSnapshot,
    type MetadataUpdateOptions,
    SESSION_STATE_FLUSH_TIMEOUT_MS,
    type SessionKeepAliveSnapshot,
} from './runtimeSessionState'
import type { AgentState, Metadata, Session, UserMessage, WritableSessionMetadata } from './types'

type TerminalRuntime = {
    create(terminalId: string, cols: number, rows: number): void
    write(terminalId: string, data: string): void
    resize(terminalId: string, cols: number, rows: number): void
    close(terminalId: string): void
    closeAll(): void
}

type RecoveryState = {
    metadata: Metadata | null
    metadataVersion: number
    agentState: AgentState | null
    agentStateVersion: number
    lastSeenMessageSeq: number | null
    backfillInFlight: Promise<void> | null
    needsBackfill: boolean
}

export class ProviderAdapterSessionClient extends EventEmitter implements RuntimeSessionClient {
    readonly sessionId: string
    readonly rpcHandlerManager: RpcHandlerManager
    private readonly channel: ProviderAdapterEventChannel
    private readonly recoveryState: RecoveryState
    private readonly recoveryOwner: RuntimeSessionRecoveryOwner
    private readonly messageDelivery: ReturnType<typeof createRuntimeMessageDelivery>
    private terminalManager: TerminalRuntime | null = null
    private readonly metadataLock = new AsyncLock()
    private readonly agentStateLock = new AsyncLock()
    private lastKeepAliveSnapshot: SessionKeepAliveSnapshot
    private observedAutoSummary: { text: string; updatedAt: number } | null = null

    constructor(session: Session) {
        super()
        this.sessionId = session.id
        this.channel = new ProviderAdapterEventChannel(this.sessionId)
        this.recoveryState = {
            metadata: session.metadata,
            metadataVersion: session.metadataVersion,
            agentState: session.agentState,
            agentStateVersion: session.agentStateVersion,
            lastSeenMessageSeq: null,
            backfillInFlight: null,
            needsBackfill: false,
        }
        this.lastKeepAliveSnapshot = createInitialKeepAliveSnapshot(session)
        const titleManager = new TitleManager()
        this.messageDelivery = createRuntimeMessageDelivery({
            onDriverSwitchSendFailure: ({ stage, code }) =>
                this.sendSessionEvent({ type: 'driver-switch-send-failed', stage, code }),
            onUserMessageObserved: (message) => titleManager.handleMessage(this as never, message.content.text),
        })
        this.recoveryOwner = new RuntimeSessionRecoveryOwner({
            token: '',
            sessionId: this.sessionId,
            getRecoveryState: () => this.recoveryState,
            enqueueUserMessage: (message, localId) => this.messageDelivery.enqueueUserMessage(message, localId),
            emitMessage: (content) => this.emit('message', content),
            observeAutoSummary: (summary) => this.observeRecoveredAutoSummary(summary),
        })
        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.sessionId,
            logger: debugProviderAdapter,
        })
        registerCommonHandlers(this.rpcHandlerManager, () => this.recoveryState.metadata?.path ?? process.cwd(), {
            onCommandCapabilitiesInvalidated: () =>
                this.channel.send('command-capabilities-invalidated', { sid: this.sessionId }),
        })
        Object.assign(this, this.createPublicApi())
        this.readInput()
    }

    onUserMessage(callback: (data: UserMessage, localId?: string) => void): void {
        this.messageDelivery.onUserMessage(callback)
    }

    connectRpcHandlers(): void {
        this.rpcHandlerManager.connect(this.channel)
    }

    private createPublicApi(): RuntimeSessionApi {
        return createRuntimeSessionApi({
            sessionId: this.sessionId,
            getRecoveryState: () => this.recoveryState,
            getRuntimeEventTransportContext: () => this.getRuntimeEventTransportContext(),
            channel: this.channel,
            metadataLock: this.metadataLock,
            agentStateLock: this.agentStateLock,
            rpcHandlerManager: this.rpcHandlerManager,
            terminalManager: { closeAll: () => this.terminalManager?.closeAll() },
            drainLock: async (lock, timeoutMs) => await this.drainLock(lock, timeoutMs),
            sessionStateFlushTimeoutMs: SESSION_STATE_FLUSH_TIMEOUT_MS,
        })
    }

    private getRuntimeEventTransportContext(): RuntimeEventTransportContext {
        return {
            sessionId: this.sessionId,
            channel: this.channel,
            emitSessionMessage: (content) => this.channel.send('message', { sid: this.sessionId, message: content }),
            getLastKeepAliveSnapshot: () => this.lastKeepAliveSnapshot,
            setLastKeepAliveSnapshot: (snapshot) => {
                this.lastKeepAliveSnapshot = snapshot
            },
            getObservedAutoSummary: () => this.observedAutoSummary,
            setObservedAutoSummary: (summary) => {
                this.observedAutoSummary = summary
            },
            updateMetadata: (handler, options) => this.updateMetadata(handler, options),
        }
    }

    private readInput(): void {
        let buffer = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (chunk) => {
            buffer += chunk
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) this.handleInputLine(line)
        })
    }

    private handleInputLine(line: string): void {
        const input = parseProviderAdapterInput(line)
        if (!input) return
        if (input.type === 'runtime.session-message' && input.sessionId === this.sessionId)
            this.recoveryOwner.handleIncomingMessage(input.message)
        else if (input.type === 'runtime.cancel-messages' && input.sessionId === this.sessionId)
            this.emit('cancel-messages', input.localIds)
        else if (input.type === 'runtime.metadata-result' || input.type === 'runtime.agent-state-result')
            this.channel.resolveAck(input)
        else if (input.type === 'runtime.rpc-request') this.handleRpc(input)
        else if (input.type === 'runtime.terminal-input') {
            this.handleTerminalInput(input.event).catch((error) => {
                debugProviderAdapter('[ProviderAdapterSessionClient] Failed to handle terminal input', error)
            })
        }
    }

    private handleRpc(input: Extract<ProviderAdapterInput, { type: 'runtime.rpc-request' }>): void {
        this.rpcHandlerManager
            .handleRequest({ method: input.method, params: JSON.stringify(input.params) })
            .then((response) => this.channel.sendRpcResponse(input.requestId, response))
    }

    private async handleTerminalInput(
        event: Extract<ProviderAdapterInput, { type: 'runtime.terminal-input' }>['event']
    ): Promise<void> {
        const terminalManager = await this.getTerminalManager()
        if (event.type === 'open') terminalManager.create(event.terminalId, event.cols, event.rows)
        else if (event.type === 'write') terminalManager.write(event.terminalId, event.data)
        else if (event.type === 'resize') terminalManager.resize(event.terminalId, event.cols, event.rows)
        else terminalManager.close(event.terminalId)
    }

    private async getTerminalManager(): Promise<TerminalRuntime> {
        if (this.terminalManager) return this.terminalManager
        const { TerminalManager } = await import('@/terminal/TerminalManager')
        this.terminalManager = new TerminalManager({
            sessionId: this.sessionId,
            getSessionPath: () => this.recoveryState.metadata?.path ?? null,
            onReady: (payload) => this.channel.send('terminal:ready', payload),
            onOutput: (payload) => this.channel.send('terminal:output', payload),
            onExit: (payload) => this.channel.send('terminal:exit', payload),
            onError: (payload) => this.channel.send('terminal:error', payload),
        })
        return this.terminalManager
    }

    private observeRecoveredAutoSummary(summary: { text: string; updatedAt: number | null }): void {
        const updatedAt = summary.updatedAt ?? Date.now()
        this.observedAutoSummary = { text: summary.text, updatedAt }
        this.updateMetadata((metadata) => ({ ...metadata, summary: { text: summary.text, updatedAt } }), {
            touchUpdatedAt: false,
        })
    }

    private async drainLock(lock: AsyncLock, timeoutMs: number): Promise<boolean> {
        if (timeoutMs <= 0) return false
        return await Promise.race([
            lock.inLock(async () => true),
            new Promise<boolean>((resolve) => {
                const timer = setTimeout(() => resolve(false), timeoutMs)
                timer.unref?.()
            }),
        ])
    }
}

export interface ProviderAdapterSessionClient extends RuntimeSessionClient {}

function debugProviderAdapter(message: string, data?: unknown): void {
    import('@/ui/logger').then(({ logger }) => logger.debug(message, data)).catch(() => undefined)
}
