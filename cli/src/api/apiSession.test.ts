import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiSessionClient, isExternalUserMessage } from './apiSession'
import {
    createAuthResponse,
    createFakeSocket,
    createRecoveredPage,
    createSession,
    createUnauthorizedAxiosError,
    type FakeSocket,
    getLatestSessionAlivePayload,
    type RecoveryState,
} from './apiSession.support'
import { ApiSessionRecoveryOwner } from './apiSessionRecoveryOwner'
import { applyRecoveredSessionSnapshot } from './sessionRecovery'

const { sockets, ioMock } = vi.hoisted(() => {
    const hoistedSockets: FakeSocket[] = []
    const hoistedIoMock = vi.fn(() => {
        const socket = createFakeSocket()
        hoistedSockets.push(socket)
        return socket
    })

    return {
        sockets: hoistedSockets,
        ioMock: hoistedIoMock,
    }
})

vi.mock('socket.io-client', () => ({
    io: ioMock,
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://localhost:3000',
    },
}))

vi.mock('../modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn(),
}))

vi.mock('../modules/common/handlers/uploads', () => ({
    cleanupUploadDir: vi.fn(async () => undefined),
}))

vi.mock('@/terminal/TerminalManager', () => ({
    TerminalManager: class {
        closeAll = vi.fn()
        create = vi.fn()
        write = vi.fn()
        resize = vi.fn()
        close = vi.fn()
    },
}))

afterEach(() => {
    vi.restoreAllMocks()
    sockets.length = 0
    ioMock.mockClear()
})

describe('ApiSessionClient recovery', () => {
    it('registers common handlers against a live working-directory provider instead of a frozen path', async () => {
        const registerCommonHandlersModule = await import('../modules/common/registerCommonHandlers')
        const client = new ApiSessionClient('token', createSession())

        expect(registerCommonHandlersModule.registerCommonHandlers).toHaveBeenCalledTimes(1)
        expect(typeof vi.mocked(registerCommonHandlersModule.registerCommonHandlers).mock.calls[0]?.[1]).toBe(
            'function'
        )

        client.close()
    })

    it('recovers snapshots and advances the cursor across recovery pages', async () => {
        const axiosGet = vi.spyOn(axios, 'get')
        axiosGet
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 10,
                    nextAfterSeq: 12,
                    hasMore: true,
                    messageSeqs: [11, 12],
                }),
            })
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 12,
                    nextAfterSeq: 13,
                    hasMore: false,
                    messageSeqs: [13],
                }),
            })

        const state: RecoveryState = {
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            lastSeenMessageSeq: 10,
            backfillInFlight: null,
            needsBackfill: false,
        }
        const owner = new ApiSessionRecoveryOwner({
            token: 'token',
            sessionId: 'session-1',
            getRecoveryState: () => state,
            enqueueUserMessage: vi.fn(),
            emitMessage: vi.fn(),
        })
        const handleIncomingMessage = vi.spyOn(owner, 'handleIncomingMessage')

        await owner.recoverSessionState()

        expect(axiosGet).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            expect.objectContaining({
                params: { afterSeq: 10, limit: 200 },
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                    'Content-Type': 'application/json',
                }),
            })
        )
        expect(axiosGet).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            expect.objectContaining({
                params: { afterSeq: 12, limit: 200 },
                headers: expect.objectContaining({
                    Authorization: 'Bearer token',
                    'Content-Type': 'application/json',
                }),
            })
        )
        expect(handleIncomingMessage).toHaveBeenCalledTimes(3)
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ seq: 11 }))
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(3, expect.objectContaining({ seq: 13 }))
        expect(state.backfillInFlight).toBeNull()
        expect(state.lastSeenMessageSeq).toBe(13)
    })
})

describe('ApiSessionClient user message delivery failures', () => {
    it('emits one durable driver-switch-send-failed event when live user delivery rejects the first post-switch turn', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        const messageListener = vi.fn()
        client.on('message', messageListener)
        client.onUserMessage(() => {
            throw new Error('Cannot inject session continuity into an empty first user turn')
        })

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '   ',
                            attachments: [],
                        },
                    },
                },
            },
        })

        const failureEvent = socket.emitCalls.find(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'driver-switch-send-failed'
        )
        expect(failureEvent?.event).toBe('message')
        expect(failureEvent?.args[0]).toMatchObject({
            sid: 'session-1',
            message: {
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'driver-switch-send-failed',
                        stage: 'socket_update',
                        code: 'empty_first_turn',
                    },
                },
            },
        })

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-2',
                    seq: 2,
                    createdAt: 2_000,
                    content: {
                        role: 'agent',
                        content: {
                            type: 'event',
                            data: {
                                type: 'ready',
                            },
                        },
                    },
                },
            },
        })

        expect(messageListener).toHaveBeenCalledTimes(1)
        expect(messageListener).toHaveBeenCalledWith({
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'ready',
                },
            },
        })
    })

    it('falls back to a generic typed failure code when queued user delivery throws an unknown object', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: 'queued first turn',
                            attachments: [],
                        },
                    },
                },
            },
        })

        client.onUserMessage(() => {
            throw { unexpected: true }
        })

        const failureEvent = socket.emitCalls.find(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'driver-switch-send-failed'
        )
        expect(failureEvent?.event).toBe('message')
        expect(failureEvent?.args[0]).toMatchObject({
            sid: 'session-1',
            message: {
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'driver-switch-send-failed',
                        stage: 'callback_flush',
                        code: 'unknown',
                    },
                },
            },
        })
    })
})

describe('ApiSessionClient metadata updates', () => {
    it('auto-generates a title from the first real user message before runtime delivery', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '请帮我修复登录白屏问题',
                            attachments: [],
                        },
                    },
                },
            },
        })
        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-2',
                    seq: 2,
                    createdAt: 2_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '再补一条上下文',
                            attachments: [],
                        },
                    },
                },
            },
        })

        const summaryMessages = socket.emitCalls.filter(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'summary'
        )

        expect(summaryMessages).toHaveLength(1)
        expect(summaryMessages[0]?.args[0]).toMatchObject({
            sid: 'session-1',
            message: {
                role: 'agent',
                content: {
                    data: {
                        isMeta: true,
                        type: 'summary',
                        summary: '帮我修复登录白屏问题',
                    },
                },
            },
        })

        client.close()
    })

    it('does not override an existing summary when replaying later user turns', () => {
        const client = new ApiSessionClient(
            'token',
            createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    summary: {
                        text: 'Existing title',
                        updatedAt: 1,
                    },
                },
            })
        )
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '新的消息',
                            attachments: [],
                        },
                    },
                },
            },
        })

        const summaryMessages = socket.emitCalls.filter(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'summary'
        )

        expect(summaryMessages).toHaveLength(0)
        client.close()
    })

    it('drops pseudo-user transcript entries from recovery delivery and does not auto-title from them', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        const onUserMessage = vi.fn()
        client.onUserMessage(onUserMessage)

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '<system-reminder>internal only</system-reminder>',
                            attachments: [],
                        },
                    },
                },
            },
        })

        expect(onUserMessage).not.toHaveBeenCalled()
        const summaryMessages = socket.emitCalls.filter(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'summary'
        )
        expect(summaryMessages).toHaveLength(0)

        client.close()
    })

    it('reuses recovered hidden summary state and avoids generating a second title after reconnect recovery', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-summary',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'agent',
                        content: {
                            type: 'output',
                            data: {
                                type: 'summary',
                                summary: 'Recovered title',
                                isMeta: true,
                                updatedAt: 1_000,
                            },
                        },
                    },
                },
            },
        })
        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-user',
                    seq: 2,
                    createdAt: 2_000,
                    content: {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: '新的真实消息',
                            attachments: [],
                        },
                    },
                },
            },
        })

        const summaryMessages = socket.emitCalls.filter(
            (entry) =>
                entry.event === 'message' &&
                (entry.args[0] as { message?: { content?: { data?: { type?: string } } } }).message?.content?.data
                    ?.type === 'summary'
        )
        expect(summaryMessages).toHaveLength(0)
        expect(client.getObservedAutoSummarySnapshot()).toMatchObject({
            text: 'Recovered title',
        })

        client.close()
    })

    it('ignores stale recovered hidden summaries when metadata already has a newer title', () => {
        const client = new ApiSessionClient(
            'token',
            createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    summary: {
                        text: 'Newest title',
                        updatedAt: 5_000,
                    },
                },
                metadataVersion: 1,
            })
        )
        const socket = sockets[0]
        const updateMetadata = vi.spyOn(client, 'updateMetadata').mockImplementation(() => {})

        socket.emit('update', {
            body: {
                t: 'new-message',
                message: {
                    id: 'message-summary',
                    seq: 1,
                    createdAt: 1_000,
                    content: {
                        role: 'agent',
                        content: {
                            type: 'output',
                            data: {
                                type: 'summary',
                                summary: 'Old title',
                                isMeta: true,
                                updatedAt: 1_000,
                            },
                        },
                    },
                },
            },
        })

        expect(updateMetadata).not.toHaveBeenCalled()
        expect(client.getObservedAutoSummarySnapshot()).toMatchObject({
            text: 'Newest title',
            updatedAt: 5_000,
        })

        client.close()
    })

    it('strips lifecycle fields before sending metadata updates', async () => {
        const client = new ApiSessionClient(
            'token',
            createSession({
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    lifecycleState: 'archived',
                    lifecycleStateSince: 1_000,
                    archivedBy: 'web',
                    archiveReason: 'Archived by user',
                },
                metadataVersion: 7,
            })
        )
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emitWithAck.mockResolvedValueOnce({
            result: 'success',
            version: 8,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                name: 'Renamed',
                lifecycleState: 'archived',
                lifecycleStateSince: 1_000,
                archivedBy: 'web',
                archiveReason: 'Archived by user',
            },
        } as any)

        client.updateMetadata(
            (metadata) =>
                ({
                    ...metadata,
                    name: 'Renamed',
                    lifecycleState: 'closed',
                }) as typeof metadata & { lifecycleState: 'closed' }
        )

        await vi.waitFor(() => {
            expect(socket.emitWithAck).toHaveBeenCalledWith('update-metadata', {
                sid: 'session-1',
                expectedVersion: 7,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    name: 'Renamed',
                },
                touchUpdatedAt: undefined,
            })
        })
    })

    it('writes auto summary metadata immediately and keeps the transcript event hidden', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        const updateMetadata = vi.spyOn(client, 'updateMetadata').mockImplementation(() => {})

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Streaming title',
            leafUuid: 'leaf-1',
        })

        expect(socket?.emitCalls).toContainEqual({
            event: 'message',
            args: [
                expect.objectContaining({
                    sid: 'session-1',
                    message: expect.objectContaining({
                        role: 'agent',
                        content: expect.objectContaining({
                            data: expect.objectContaining({
                                type: 'summary',
                                isMeta: true,
                            }),
                        }),
                    }),
                }),
            ],
        })
        expect(updateMetadata).toHaveBeenCalledWith(expect.any(Function), {
            touchUpdatedAt: false,
        })
    })

    it('keeps only the latest observed auto summary snapshot in memory', () => {
        const client = new ApiSessionClient('token', createSession())
        const updateMetadata = vi.spyOn(client, 'updateMetadata').mockImplementation(() => {})

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'First title',
            leafUuid: 'leaf-1',
        })
        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Final title',
            leafUuid: 'leaf-2',
        })

        expect(updateMetadata).toHaveBeenCalledTimes(2)
        expect(client.getObservedAutoSummarySnapshot()).toMatchObject({
            text: 'Final title',
        })

        const handler = updateMetadata.mock.calls[1]?.[0] as unknown as (
            metadata: Record<string, unknown>
        ) => Record<string, unknown>
        expect(handler({ path: '/tmp/project', host: 'localhost' })).toMatchObject({
            summary: {
                text: 'Final title',
            },
        })
    })
})

describe('isExternalUserMessage', () => {
    it('rejects system-injected pseudo-user transcript entries', () => {
        expect(
            isExternalUserMessage({
                type: 'user',
                isSidechain: false,
                message: {
                    content: '<system-reminder>internal only</system-reminder>',
                },
            } as any)
        ).toBe(false)
    })

    it('accepts real external user text', () => {
        expect(
            isExternalUserMessage({
                type: 'user',
                isSidechain: false,
                message: {
                    content: 'hello world',
                },
            } as any)
        ).toBe(true)
    })
})

describe('ApiSessionClient keepalive continuity', () => {
    it('seeds the initial keepalive snapshot from the session snapshot', () => {
        new ApiSessionClient(
            'token',
            createSession({
                thinking: true,
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    startedBy: 'runner',
                },
            })
        )
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(
            expect.objectContaining({
                sid: 'session-1',
                thinking: true,
                mode: 'remote',
                permissionMode: 'safe-yolo',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                collaborationMode: 'plan',
            })
        )
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
            collaborationMode: 'plan',
        })
        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(
            expect.objectContaining({
                sid: 'session-1',
                thinking: true,
                mode: 'remote',
                permissionMode: 'safe-yolo',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                collaborationMode: 'plan',
            })
        )
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
            modelReasoningEffort: 'high',
        })
        client.keepAlive(false, 'remote')
        socket.emit('connect')

        const sessionAlivePayload = getLatestSessionAlivePayload(socket)
        expect(sessionAlivePayload).toEqual(
            expect.objectContaining({
                sid: 'session-1',
                thinking: false,
                mode: 'remote',
            })
        )
        expect(sessionAlivePayload).not.toHaveProperty('model')
        expect(sessionAlivePayload).not.toHaveProperty('modelReasoningEffort')
    })

    it('flushes the latest keepalive snapshot through the reliable channel before ready', async () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('connect')
        ;(socket as FakeSocket & { connected?: boolean }).connected = true
        socket.emitCalls.length = 0
        socket.volatileEmitCalls.length = 0

        client.keepAlive(false, 'remote', {
            permissionMode: 'safe-yolo',
        })
        expect(socket.volatileEmitCalls.at(-1)?.event).toBe('session-alive')

        await client.flushKeepAliveSnapshot()

        expect(getLatestSessionAlivePayload(socket)).toEqual(
            expect.objectContaining({
                sid: 'session-1',
                thinking: false,
                mode: 'remote',
                permissionMode: 'safe-yolo',
            })
        )
    })
})
