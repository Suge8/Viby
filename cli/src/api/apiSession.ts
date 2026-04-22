import { EventEmitter } from 'node:events'
import {
    type ClientToServerEvents,
    type ServerToClientEvents,
    TerminalClosePayloadSchema,
    TerminalOpenPayloadSchema,
    TerminalResizePayloadSchema,
    TerminalWritePayloadSchema,
} from '@viby/protocol'
import { io, type Socket } from 'socket.io-client'
import { configuration } from '@/configuration'
import { TerminalManager } from '@/terminal/TerminalManager'
import { logger } from '@/ui/logger'
import { AsyncLock } from '@/utils/lock'
import { TitleManager } from '../agent/titleManager'
import { registerCommonHandlers } from '../modules/common/registerCommonHandlers'
import { createApiSessionMessageDelivery } from './apiSessionMessageDelivery'
import { type ApiSessionPublicApi, createApiSessionPublicApi } from './apiSessionPublicApi'
import { ApiSessionRecoveryOwner } from './apiSessionRecoveryOwner'
import { registerApiSessionSocketHandlers } from './apiSessionSocketHandlers'
import {
    createInitialKeepAliveSnapshot,
    isExternalUserMessage,
    type MetadataUpdateOptions,
    SESSION_STATE_FLUSH_TIMEOUT_MS,
    type SessionKeepAliveRuntime,
    type SessionKeepAliveSnapshot,
} from './apiSessionState'
import { emitSessionAlive, type TransportContext } from './apiSessionTransport'
import { RpcHandlerManager } from './rpc/RpcHandlerManager'
import { type RecoveryState } from './sessionRecovery'
import type { AgentState, Metadata, Session, UserMessage, WritableSessionMetadata } from './types'

export { isExternalUserMessage } from './apiSessionState'

const SESSION_SOCKET_RECONNECTION_DELAY_MS = 1_000
const SESSION_SOCKET_RECONNECTION_DELAY_MAX_MS = 5_000

export class ApiSessionClient extends EventEmitter {
    private readonly token: string
    readonly sessionId: string
    private readonly recoveryState: RecoveryState
    private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>
    private hasConnectedOnce = false
    private observedAutoSummary: { text: string; updatedAt: number } | null = null
    readonly rpcHandlerManager: RpcHandlerManager
    private readonly terminalManager: TerminalManager
    private readonly recoveryOwner: ApiSessionRecoveryOwner
    private readonly messageDelivery: ReturnType<typeof createApiSessionMessageDelivery>
    private agentStateLock = new AsyncLock()
    private metadataLock = new AsyncLock()
    private lastKeepAliveSnapshot: SessionKeepAliveSnapshot

    private getRecoveryState(): RecoveryState {
        return this.recoveryState
    }

    private emitSessionMessage(content: unknown): void {
        this.socket.emit('message', {
            sid: this.sessionId,
            message: content,
        })
    }

    private observeRecoveredAutoSummary(summary: { text: string; updatedAt: number | null }): void {
        const nextUpdatedAt = summary.updatedAt
        const currentObserved = this.observedAutoSummary
        const currentMetadataSummary = this.recoveryState.metadata?.summary

        if (nextUpdatedAt === null && (currentObserved !== null || currentMetadataSummary?.text?.trim())) {
            return
        }

        if (currentObserved && nextUpdatedAt !== null && currentObserved.updatedAt >= nextUpdatedAt) {
            return
        }

        if (currentMetadataSummary && nextUpdatedAt !== null && currentMetadataSummary.updatedAt >= nextUpdatedAt) {
            this.observedAutoSummary = {
                text: currentMetadataSummary.text,
                updatedAt: currentMetadataSummary.updatedAt,
            }
            return
        }

        const updatedAt = nextUpdatedAt ?? Date.now()
        this.observedAutoSummary = {
            text: summary.text,
            updatedAt,
        }

        if (currentMetadataSummary?.text === summary.text && currentMetadataSummary.updatedAt === updatedAt) {
            return
        }

        this.updateMetadata(
            (metadata) => ({
                ...metadata,
                summary: {
                    text: summary.text,
                    updatedAt,
                },
            }),
            {
                touchUpdatedAt: false,
            }
        )
    }

    constructor(token: string, session: Session) {
        super()
        this.token = token
        this.sessionId = session.id
        const titleManager = new TitleManager()
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
        this.messageDelivery = createApiSessionMessageDelivery({
            onDriverSwitchSendFailure: ({ stage, code }) => {
                this.sendSessionEvent({
                    type: 'driver-switch-send-failed',
                    stage,
                    code,
                })
            },
            onUserMessageObserved: (message) => {
                titleManager.handleMessage(this, message.content.text)
            },
        })
        this.recoveryOwner = new ApiSessionRecoveryOwner({
            token,
            sessionId: this.sessionId,
            getRecoveryState: () => this.getRecoveryState(),
            enqueueUserMessage: (message) => this.messageDelivery.enqueueUserMessage(message),
            emitMessage: (content) => this.emit('message', content),
            observeAutoSummary: (summary) => this.observeRecoveredAutoSummary(summary),
        })

        this.rpcHandlerManager = new RpcHandlerManager({
            scopePrefix: this.sessionId,
            logger: (msg, data) => logger.debug(msg, data),
        })

        registerCommonHandlers(this.rpcHandlerManager, () => this.recoveryState.metadata?.path ?? process.cwd(), {
            onCommandCapabilitiesInvalidated: () => {
                this.socket.emit('command-capabilities-invalidated', {
                    sid: this.sessionId,
                })
            },
        })

        this.socket = io(`${configuration.apiUrl}/cli`, {
            auth: {
                token: this.token,
                clientType: 'session-scoped' as const,
                sessionId: this.sessionId,
            },
            path: '/socket.io/',
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: SESSION_SOCKET_RECONNECTION_DELAY_MS,
            reconnectionDelayMax: SESSION_SOCKET_RECONNECTION_DELAY_MAX_MS,
            transports: ['websocket'],
            autoConnect: false,
        })

        this.terminalManager = new TerminalManager({
            sessionId: this.sessionId,
            getSessionPath: () => this.recoveryState.metadata?.path ?? null,
            onReady: (payload) => this.socket.emit('terminal:ready', payload),
            onOutput: (payload) => this.socket.emit('terminal:output', payload),
            onExit: (payload) => this.socket.emit('terminal:exit', payload),
            onError: (payload) => this.socket.emit('terminal:error', payload),
        })

        const thisOwner = this
        registerApiSessionSocketHandlers({
            sessionId: this.sessionId,
            socket: this.socket,
            rpcHandlerManager: this.rpcHandlerManager,
            terminalManager: this.terminalManager,
            hasConnectedOnceRef: {
                get current() {
                    return thisOwner.hasConnectedOnce
                },
                set current(value: boolean) {
                    thisOwner.hasConnectedOnce = value
                },
            },
            markNeedsBackfill: () => {
                thisOwner.recoveryState.needsBackfill = true
            },
            onBackfillIfNeeded: async () => {
                await thisOwner.recoveryOwner.backfillIfNeeded()
            },
            emitSessionAlive: () => {
                thisOwner.emitSessionAlive(thisOwner.lastKeepAliveSnapshot)
            },
            onHandleIncomingMessage: (message) => {
                thisOwner.recoveryOwner.handleIncomingMessage(message)
            },
            onMetadataUpdate: (value, version) => {
                thisOwner.recoveryState.metadata = value as Metadata
                thisOwner.recoveryState.metadataVersion = version
            },
            getMetadataVersion: () => thisOwner.recoveryState.metadataVersion,
            onAgentStateUpdate: (value, version) => {
                thisOwner.recoveryState.agentState = value as AgentState | null
                thisOwner.recoveryState.agentStateVersion = version
            },
            getAgentStateVersion: () => thisOwner.recoveryState.agentStateVersion,
            emitMessage: (content) => {
                thisOwner.emit('message', content)
            },
            terminalSchemas: {
                open: TerminalOpenPayloadSchema,
                write: TerminalWritePayloadSchema,
                resize: TerminalResizePayloadSchema,
                close: TerminalClosePayloadSchema,
            },
        })

        Object.assign(
            this,
            createApiSessionPublicApi({
                sessionId: this.sessionId,
                getRecoveryState: () => this.getRecoveryState(),
                getTransportContext: () => this.getTransportContext(),
                socket: this.socket,
                metadataLock: this.metadataLock,
                agentStateLock: this.agentStateLock,
                rpcHandlerManager: this.rpcHandlerManager,
                terminalManager: this.terminalManager,
                drainLock: async (lock, timeoutMs) => await this.drainLock(lock, timeoutMs),
                sessionStateFlushTimeoutMs: SESSION_STATE_FLUSH_TIMEOUT_MS,
            })
        )

        this.socket.connect()
    }

    onUserMessage(callback: (data: UserMessage) => void): void {
        this.messageDelivery.onUserMessage(callback)
    }

    private getTransportContext(): TransportContext {
        return {
            sessionId: this.sessionId,
            socket: this.socket,
            emitSessionMessage: (content: unknown) => this.emitSessionMessage(content),
            getLastKeepAliveSnapshot: () => this.lastKeepAliveSnapshot,
            setLastKeepAliveSnapshot: (snapshot: SessionKeepAliveSnapshot) => {
                this.lastKeepAliveSnapshot = snapshot
            },
            getObservedAutoSummary: () => this.observedAutoSummary,
            setObservedAutoSummary: (summary: { text: string; updatedAt: number } | null) => {
                this.observedAutoSummary = summary
            },
            updateMetadata: (
                handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
                options?: MetadataUpdateOptions
            ) => {
                this.updateMetadata(handler, options)
            },
        }
    }

    private emitSessionAlive(snapshot: SessionKeepAliveSnapshot, options?: { volatile?: boolean }): void {
        emitSessionAlive(this.getTransportContext(), snapshot, options)
    }

    private async drainLock(lock: AsyncLock, timeoutMs: number): Promise<boolean> {
        if (timeoutMs <= 0) {
            return false
        }

        return await new Promise<boolean>((resolve) => {
            let settled = false
            let timeout: ReturnType<typeof setTimeout> | null = null

            const finish = (value: boolean) => {
                if (settled) return
                settled = true
                if (timeout) {
                    clearTimeout(timeout)
                }
                resolve(value)
            }

            timeout = setTimeout(() => finish(false), timeoutMs)

            lock.inLock(async () => {})
                .then(() => finish(true))
                .catch(() => finish(false))
        })
    }
}

export interface ApiSessionClient extends ApiSessionPublicApi {}
