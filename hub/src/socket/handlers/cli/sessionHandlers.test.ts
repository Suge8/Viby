import { describe, expect, it } from 'bun:test'
import type { ClientToServerEvents, Update } from '@viby/protocol'
import type { SyncEvent } from '@viby/protocol/types'
import { Store } from '../../../store'
import type { CliSocketWithData } from '../../socketTypes'
import { SessionStreamManager } from '../../../sync/sessionStreamManager'
import {
    mergeSessionMetadataPreservingLifecycle,
    registerSessionHandlers
} from './sessionHandlers'

type RegisteredSessionHandlers = Partial<Pick<ClientToServerEvents, 'message' | 'update-metadata'>>

type MockSocket = {
    socket: CliSocketWithData
    handlers: RegisteredSessionHandlers
    emittedUpdates: Array<{ room: string; event: 'update'; payload: Update }>
}

type SessionHandlersHarness = {
    store: Store
    session: ReturnType<Store['sessions']['getOrCreateSession']>
    handlers: RegisteredSessionHandlers
    emittedUpdates: MockSocket['emittedUpdates']
    onWebappEvents: SyncEvent[]
}

type UpdateMetadataResponse = Parameters<ClientToServerEvents['update-metadata']>[1] extends (
    answer: infer TAnswer
) => void
    ? TAnswer
    : never

function createMockSocket(): MockSocket {
    const handlers: RegisteredSessionHandlers = {}
    const emittedUpdates: Array<{ room: string; event: 'update'; payload: Update }> = []

    const socket = {
        on<K extends keyof RegisteredSessionHandlers>(event: K, handler: NonNullable<RegisteredSessionHandlers[K]>) {
            handlers[event] = handler
            return this
        },
        to(room: string) {
            return {
                emit(event: 'update', payload: Update) {
                    emittedUpdates.push({ room, event, payload })
                }
            }
        }
    } as unknown as CliSocketWithData

    return {
        socket,
        handlers,
        emittedUpdates
    }
}

function createSessionHandlersHarness(): SessionHandlersHarness {
    const store = new Store(':memory:')
    const session = store.sessions.getOrCreateSession({
        tag: 'session-archive-metadata',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            lifecycleState: 'archived',
            lifecycleStateSince: 1_000,
            archivedBy: 'web',
            archiveReason: 'Archived by user'
        },
        agentState: null
    })
    const onWebappEvents: SyncEvent[] = []
    const { socket, handlers, emittedUpdates } = createMockSocket()

    registerSessionHandlers(socket, {
        store,
        sessionStreamManager: new SessionStreamManager(),
        resolveSessionAccess(sessionId) {
            const storedSession = store.sessions.getSession(sessionId)
            if (!storedSession) {
                return { ok: false as const, reason: 'not-found' as const }
            }

            return { ok: true as const, value: storedSession }
        },
        emitAccessError() {
        },
        onWebappEvent(event) {
            onWebappEvents.push(event)
        }
    })

    return {
        store,
        session,
        handlers,
        emittedUpdates,
        onWebappEvents
    }
}

function assertUpdateMetadataHandler(
    handlers: RegisteredSessionHandlers
): NonNullable<RegisteredSessionHandlers['update-metadata']> {
    const handler = handlers['update-metadata']
    expect(handler).toBeDefined()
    return handler as NonNullable<RegisteredSessionHandlers['update-metadata']>
}

function assertSuccessfulMetadataResponse(
    response: UpdateMetadataResponse | null
): Extract<UpdateMetadataResponse, { result: 'success' }> {
    expect(response).not.toBeNull()
    expect(response?.result).toBe('success')
    return response as Extract<UpdateMetadataResponse, { result: 'success' }>
}

describe('mergeSessionMetadataPreservingLifecycle', () => {
    it('preserves archived lifecycle metadata across unrelated CLI metadata updates', () => {
        const merged = mergeSessionMetadataPreservingLifecycle(
            {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'archived',
                lifecycleStateSince: 1_000,
                archivedBy: 'web',
                archiveReason: 'Archived by user'
            },
            {
                path: '/tmp/project',
                host: 'localhost',
                summary: {
                    text: 'Auto title',
                    updatedAt: 2_000
                }
            }
        )

        expect(merged).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            summary: {
                text: 'Auto title',
                updatedAt: 2_000
            },
            lifecycleState: 'archived',
            lifecycleStateSince: 1_000,
            archivedBy: 'web',
            archiveReason: 'Archived by user'
        })
    })

    it('ignores explicit lifecycle fields from CLI metadata updates', () => {
        const merged = mergeSessionMetadataPreservingLifecycle(
            {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'archived',
                lifecycleStateSince: 1_000,
                archivedBy: 'web',
                archiveReason: 'Archived by user'
            },
            {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'closed',
                lifecycleStateSince: 2_000
            }
        )

        expect(merged).toEqual({
            path: '/tmp/project',
            host: 'localhost',
            lifecycleState: 'archived',
            lifecycleStateSince: 1_000,
            archivedBy: 'web',
            archiveReason: 'Archived by user'
        })
    })

    it('does not let CLI metadata create lifecycle fields when none exist yet', () => {
        const merged = mergeSessionMetadataPreservingLifecycle(
            {
                path: '/tmp/project',
                host: 'localhost'
            },
            {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'closed',
                lifecycleStateSince: 2_000
            }
        )

        expect(merged).toEqual({
            path: '/tmp/project',
            host: 'localhost'
        })
    })
})

describe('registerSessionHandlers update-metadata', () => {
    it('preserves archived lifecycle metadata in store and emitted update payloads', () => {
        const harness = createSessionHandlersHarness()
        const handler = assertUpdateMetadataHandler(harness.handlers)
        let response: UpdateMetadataResponse | null = null
        const expectedMetadata = {
            path: '/tmp/project',
            host: 'localhost',
            summary: {
                text: 'Auto title',
                updatedAt: 2_000
            },
            lifecycleState: 'archived',
            lifecycleStateSince: 1_000,
            archivedBy: 'web',
            archiveReason: 'Archived by user'
        }

        handler(
            {
                sid: harness.session.id,
                expectedVersion: harness.session.metadataVersion,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    summary: {
                        text: 'Auto title',
                        updatedAt: 2_000
                    }
                }
            },
            (answer) => {
                response = answer
            }
        )

        const successResponse = assertSuccessfulMetadataResponse(response)

        expect(successResponse).toEqual({
            result: 'success',
            version: 2,
            metadata: expectedMetadata
        })
        expect(harness.store.sessions.getSession(harness.session.id)?.metadata).toEqual(expectedMetadata)
        expect(harness.emittedUpdates).toHaveLength(1)
        expect(harness.emittedUpdates[0]).toMatchObject({
            room: `session:${harness.session.id}`,
            event: 'update',
            payload: {
                body: {
                    t: 'update-session',
                    sid: harness.session.id,
                    metadata: {
                        version: 2,
                        value: expectedMetadata
                    }
                }
            }
        })
        expect(harness.onWebappEvents).toEqual([
            {
                type: 'session-updated',
                sessionId: harness.session.id,
                data: { sid: harness.session.id }
            }
        ])
    })

    it('ignores explicit lifecycle updates and keeps archived lifecycle metadata authoritative', () => {
        const harness = createSessionHandlersHarness()
        const handler = assertUpdateMetadataHandler(harness.handlers)
        let response: UpdateMetadataResponse | null = null
        const expectedMetadata = {
            path: '/tmp/project',
            host: 'localhost',
            lifecycleState: 'archived',
            lifecycleStateSince: 1_000,
            archivedBy: 'web',
            archiveReason: 'Archived by user'
        }

        handler(
            {
                sid: harness.session.id,
                expectedVersion: harness.session.metadataVersion,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    lifecycleState: 'closed',
                    lifecycleStateSince: 2_000
                }
            },
            (answer) => {
                response = answer
            }
        )

        const successResponse = assertSuccessfulMetadataResponse(response)

        expect(successResponse).toEqual({
            result: 'success',
            version: 2,
            metadata: expectedMetadata
        })
        expect(harness.store.sessions.getSession(harness.session.id)?.metadata).toEqual(expectedMetadata)
        expect(harness.emittedUpdates[0]?.payload.body).toMatchObject({
            t: 'update-session',
            sid: harness.session.id,
            metadata: {
                version: 2,
                value: expectedMetadata
            }
        })
    })
})

describe('registerSessionHandlers message', () => {
    it('appends message events without reviving legacy team projection side effects', () => {
        const harness = createSessionHandlersHarness()
        const handler = harness.handlers.message
        expect(handler).toBeDefined()

        handler?.({
            sid: harness.session.id,
            message: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'tool-call',
                        name: 'TeamCreate',
                        input: {
                            team_name: 'Alpha Team'
                        }
                    }
                }
            }
        })

        expect(harness.onWebappEvents).toEqual([
            {
                type: 'message-received',
                sessionId: harness.session.id,
                message: expect.objectContaining({
                    content: expect.objectContaining({
                        role: 'agent'
                    })
                })
            }
        ])
    })
})
