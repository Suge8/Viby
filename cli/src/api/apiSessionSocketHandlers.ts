import type { ClientToServerEvents, ServerToClientEvents, Update } from '@viby/protocol'
import type { Socket } from 'socket.io-client'
import type { ZodType } from 'zod'
import type { TerminalManager } from '@/terminal/TerminalManager'
import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import type { RpcHandlerManager } from './rpc/RpcHandlerManager'
import { AgentStateSchema, MetadataSchema } from './types'

export function registerApiSessionSocketHandlers(options: {
    sessionId: string
    socket: Socket<ServerToClientEvents, ClientToServerEvents>
    rpcHandlerManager: RpcHandlerManager
    terminalManager: TerminalManager
    hasConnectedOnceRef: { current: boolean }
    markNeedsBackfill: () => void
    onBackfillIfNeeded: () => Promise<void>
    emitSessionAlive: () => void
    onHandleIncomingMessage: (message: { seq?: number | null; content: unknown }) => void
    onMetadataUpdate: (value: unknown, version: number) => void
    getMetadataVersion: () => number
    onAgentStateUpdate: (value: unknown | null, version: number) => void
    getAgentStateVersion: () => number
    emitMessage: (content: unknown) => void
    terminalSchemas: {
        open: ZodType<{ sessionId: string; terminalId: string; cols: number; rows: number }>
        write: ZodType<{ sessionId: string; terminalId: string; data: string }>
        resize: ZodType<{ sessionId: string; terminalId: string; cols: number; rows: number }>
        close: ZodType<{ sessionId: string; terminalId: string }>
    }
}): void {
    const {
        sessionId,
        socket,
        rpcHandlerManager,
        terminalManager,
        hasConnectedOnceRef,
        markNeedsBackfill,
        onBackfillIfNeeded,
        emitSessionAlive,
        onHandleIncomingMessage,
        onMetadataUpdate,
        getMetadataVersion,
        onAgentStateUpdate,
        getAgentStateVersion,
        emitMessage,
        terminalSchemas,
    } = options

    socket.on('connect', () => {
        logger.debug('Socket connected successfully')
        rpcHandlerManager.onSocketConnect(socket)
        if (hasConnectedOnceRef.current) {
            markNeedsBackfill()
        }
        runDetachedTask(onBackfillIfNeeded, '[API] Socket backfill failed')
        hasConnectedOnceRef.current = true
        emitSessionAlive()
    })

    socket.on('rpc-request', async (data: { method: string; params: string }, callback: (response: string) => void) => {
        callback(await rpcHandlerManager.handleRequest(data))
    })

    socket.on('disconnect', (reason) => {
        logger.debug('[API] Socket disconnected:', reason)
        rpcHandlerManager.onSocketDisconnect()
        terminalManager.closeAll()
        if (hasConnectedOnceRef.current) {
            markNeedsBackfill()
        }
    })

    socket.on('connect_error', (error) => {
        logger.debug('[API] Socket connection error:', error)
        rpcHandlerManager.onSocketDisconnect()
    })

    socket.on('error', (payload) => {
        logger.debug('[API] Socket error:', payload)
    })

    const handleTerminalEvent =
        <T extends { sessionId: string }>(schema: ZodType<T>, handler: (payload: T) => void) =>
        (data: unknown) => {
            const parsed = schema.safeParse(data)
            if (!parsed.success || parsed.data.sessionId !== sessionId) {
                return
            }
            handler(parsed.data)
        }

    socket.on(
        'terminal:open',
        handleTerminalEvent(terminalSchemas.open, (payload) => {
            terminalManager.create(payload.terminalId, payload.cols, payload.rows)
        })
    )
    socket.on(
        'terminal:write',
        handleTerminalEvent(terminalSchemas.write, (payload) => {
            terminalManager.write(payload.terminalId, payload.data)
        })
    )
    socket.on(
        'terminal:resize',
        handleTerminalEvent(terminalSchemas.resize, (payload) => {
            terminalManager.resize(payload.terminalId, payload.cols, payload.rows)
        })
    )
    socket.on(
        'terminal:close',
        handleTerminalEvent(terminalSchemas.close, (payload) => {
            terminalManager.close(payload.terminalId)
        })
    )

    socket.on('update', (data: Update) => {
        try {
            if (!data.body) return

            if (data.body.t === 'new-message') {
                onHandleIncomingMessage(data.body.message)
                return
            }

            if (data.body.t === 'update-session') {
                if (data.body.metadata && data.body.metadata.version > getMetadataVersion()) {
                    const parsed = MetadataSchema.safeParse(data.body.metadata.value)
                    if (parsed.success) {
                        onMetadataUpdate(parsed.data, data.body.metadata.version)
                    } else {
                        logger.debug('[API] Ignoring invalid metadata update', { version: data.body.metadata.version })
                    }
                }

                if (data.body.agentState && data.body.agentState.version > getAgentStateVersion()) {
                    const next = data.body.agentState.value
                    if (next == null) {
                        onAgentStateUpdate(null, data.body.agentState.version)
                    } else {
                        const parsed = AgentStateSchema.safeParse(next)
                        if (parsed.success) {
                            onAgentStateUpdate(parsed.data, data.body.agentState.version)
                        } else {
                            logger.debug('[API] Ignoring invalid agentState update', {
                                version: data.body.agentState.version,
                            })
                        }
                    }
                }
                return
            }

            emitMessage(data.body)
        } catch (error) {
            logger.debug('[SOCKET] [UPDATE] [ERROR] Error handling update', { error })
        }
    })
}
