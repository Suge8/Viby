import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Session } from './types'
import { ApiSessionClient } from './apiSession'

class FakeSocket {
    private readonly listeners = new Map<string, Array<(...args: any[]) => void>>()
    readonly emitCalls: Array<{ event: string; args: any[] }> = []
    readonly volatileEmitCalls: Array<{ event: string; args: any[] }> = []

    readonly volatile = {
        emit: (event: string, ...args: any[]) => {
            this.volatileEmitCalls.push({ event, args })
        }
    }

    on(event: string, handler: (...args: any[]) => void): this {
        const current = this.listeners.get(event) ?? []
        current.push(handler)
        this.listeners.set(event, current)
        return this
    }

    off(event: string, handler: (...args: any[]) => void): this {
        const current = this.listeners.get(event) ?? []
        this.listeners.set(event, current.filter((entry) => entry !== handler))
        return this
    }

    emit(event: string, ...args: any[]): void {
        this.emitCalls.push({ event, args })
        const handlers = this.listeners.get(event) ?? []
        for (const handler of handlers) {
            handler(...args)
        }
    }

    emitWithAck = vi.fn(async () => ({ result: 'success' }))
    connect = vi.fn()
    disconnect = vi.fn()
    timeout = vi.fn(() => ({
        emitWithAck: vi.fn(async () => undefined)
    }))
}

const { sockets, ioMock } = vi.hoisted(() => {
    const hoistedSockets: FakeSocket[] = []
    const hoistedIoMock = vi.fn(() => {
        const socket = new FakeSocket()
        hoistedSockets.push(socket)
        return socket
    })

    return {
        sockets: hoistedSockets,
        ioMock: hoistedIoMock
    }
})

vi.mock('socket.io-client', () => ({
    io: ioMock
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://localhost:3000'
    }
}))

vi.mock('../modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}))

vi.mock('../modules/common/handlers/uploads', () => ({
    cleanupUploadDir: vi.fn(async () => undefined)
}))

vi.mock('@/terminal/TerminalManager', () => ({
    TerminalManager: class {
        closeAll = vi.fn()
        create = vi.fn()
        write = vi.fn()
        resize = vi.fn()
        close = vi.fn()
    }
}))

type RecoverSessionStateMethod = (this: ApiSessionClient) => Promise<void>

const recoverSessionState = (
    ApiSessionClient.prototype as unknown as { recoverSessionState: RecoverSessionStateMethod }
).recoverSessionState

function createRecoveredMessage(seq: number) {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: `message ${seq}`
            }
        },
        createdAt: seq * 1_000
    }
}

function createRecoveredPage(options: {
    afterSeq: number
    nextAfterSeq: number
    hasMore: boolean
    messageSeqs: number[]
}) {
    return {
        session: {
            id: 'session-1',
            seq: options.nextAfterSeq,
            createdAt: 1,
            updatedAt: options.nextAfterSeq * 1_000,
            active: true,
            activeAt: options.nextAfterSeq * 1_000,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: 'default'
        },
        messages: options.messageSeqs.map(createRecoveredMessage),
        page: {
            afterSeq: options.afterSeq,
            nextAfterSeq: options.nextAfterSeq,
            limit: 200,
            hasMore: options.hasMore
        }
    }
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides
    }
}

function getLatestSessionAlivePayload(socket: FakeSocket): Record<string, unknown> | undefined {
    const call = [...socket.emitCalls].reverse().find((entry) => entry.event === 'session-alive')
    return call?.args[0] as Record<string, unknown> | undefined
}

afterEach(() => {
    vi.restoreAllMocks()
    sockets.length = 0
    ioMock.mockClear()
})

describe('ApiSessionClient recovery', () => {
    it('recovers snapshots and advances the cursor across recovery pages', async () => {
        const axiosGet = vi.spyOn(axios, 'get')
        axiosGet
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 10,
                    nextAfterSeq: 12,
                    hasMore: true,
                    messageSeqs: [11, 12]
                })
            })
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 12,
                    nextAfterSeq: 13,
                    hasMore: false,
                    messageSeqs: [13]
                })
            })

        const createAuthorizedJsonRequestConfig = vi.fn((params?: Record<string, number>) => ({ params }))
        const applyRecoveredSessionSnapshot = vi.fn()
        const handleIncomingMessage = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            backfillInFlight: null,
            lastSeenMessageSeq: 10,
            sessionId: 'session-1',
            createAuthorizedJsonRequestConfig,
            applyRecoveredSessionSnapshot,
            handleIncomingMessage
        }) as ApiSessionClient

        await recoverSessionState.call(client)

        expect(createAuthorizedJsonRequestConfig).toHaveBeenNthCalledWith(1, {
            afterSeq: 10,
            limit: 200
        })
        expect(createAuthorizedJsonRequestConfig).toHaveBeenNthCalledWith(2, {
            afterSeq: 12,
            limit: 200
        })
        expect(axiosGet).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            { params: { afterSeq: 10, limit: 200 } }
        )
        expect(axiosGet).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            { params: { afterSeq: 12, limit: 200 } }
        )
        expect(applyRecoveredSessionSnapshot).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'session-1', seq: 12 })
        )
        expect(applyRecoveredSessionSnapshot).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ id: 'session-1', seq: 13 })
        )
        expect(handleIncomingMessage).toHaveBeenCalledTimes(3)
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ seq: 11 })
        )
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ seq: 13 })
        )
        expect((client as unknown as { backfillInFlight: Promise<void> | null }).backfillInFlight).toBeNull()
    })
})

describe('ApiSessionClient metadata updates', () => {
    it('defers auto summary metadata writes until ready', () => {
        const emit = vi.fn()
        const updateMetadata = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            sessionId: 'session-1',
            socket: { emit },
            updateMetadata,
            pendingAutoSummary: null
        }) as ApiSessionClient

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Streaming title',
            leafUuid: 'leaf-1'
        })

        expect(emit).toHaveBeenCalledWith('message', expect.objectContaining({
            sid: 'session-1',
            message: expect.objectContaining({
                role: 'agent'
            })
        }))
        expect(updateMetadata).not.toHaveBeenCalled()

        client.sendSessionEvent({ type: 'ready' })

        expect(updateMetadata).toHaveBeenCalledWith(expect.any(Function), {
            touchUpdatedAt: false
        })
    })

    it('flushes only the latest pending auto summary when ready arrives', () => {
        const emit = vi.fn()
        const updateMetadata = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            sessionId: 'session-1',
            socket: { emit },
            updateMetadata,
            pendingAutoSummary: null
        }) as ApiSessionClient

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'First title',
            leafUuid: 'leaf-1'
        })
        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Final title',
            leafUuid: 'leaf-2'
        })

        client.sendSessionEvent({ type: 'ready' })

        expect(updateMetadata).toHaveBeenCalledTimes(1)

        const handler = updateMetadata.mock.calls[0]?.[0] as ((metadata: Record<string, unknown>) => Record<string, unknown>)
        expect(handler({ path: '/tmp/project', host: 'localhost' })).toMatchObject({
            summary: {
                text: 'Final title'
            }
        })
    })
})

describe('ApiSessionClient keepalive continuity', () => {
    it('seeds the initial keepalive snapshot from the session snapshot', () => {
        new ApiSessionClient('token', createSession({
            thinking: true,
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                startedBy: 'runner',
                startedFromRunner: true
            }
        }))
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: true,
            mode: 'remote',
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        }))
    })

    it('replays the latest keepalive snapshot on reconnect instead of resetting to thinking=false', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        client.keepAlive(true, 'remote', {
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        })
        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: true,
            mode: 'remote',
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        }))
    })

    it('drops stale runtime fields when the latest keepalive snapshot omits them', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        client.keepAlive(true, 'remote', {
            model: 'gpt-5.4',
            modelReasoningEffort: 'high'
        })
        client.keepAlive(false, 'local')
        socket.emit('connect')

        const sessionAlivePayload = getLatestSessionAlivePayload(socket)
        expect(sessionAlivePayload).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: false,
            mode: 'local'
        }))
        expect(sessionAlivePayload).not.toHaveProperty('model')
        expect(sessionAlivePayload).not.toHaveProperty('modelReasoningEffort')
    })
})
