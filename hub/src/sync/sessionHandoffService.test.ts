import { describe, expect, it } from 'bun:test'
import {
    type DecryptedMessage,
    SESSION_RECOVERY_PAGE_SIZE,
    type Session,
    SessionHandoffContractError,
} from '@viby/protocol'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'
import { Store } from '../store'
import { SessionHandoffBuildError, SessionHandoffService } from './sessionHandoffService'
import { SyncEngine } from './syncEngine'

function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {},
                    }
                },
            }
        },
    } as unknown as Server
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 2,
        active: true,
        activeAt: 2,
        metadata: {
            path: '/repo',
            host: 'machine',
            driver: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: 'gpt-5',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'plan',
        ...overrides,
    }
}

function createEngineHarness() {
    const store = new Store(':memory:')
    const engine = new SyncEngine(store, createIoStub(), {} as RpcRegistry, { broadcast() {} })

    return { store, engine }
}

function createEngineSession(
    engine: SyncEngine,
    overrides: Partial<Parameters<SyncEngine['getOrCreateSession']>[0]> = {},
    options: { includeLiveConfigDefaults?: boolean } = {}
): Session {
    const includeLiveConfigDefaults = options.includeLiveConfigDefaults ?? true

    return engine.getOrCreateSession({
        tag: 'handoff-session',
        metadata: {
            path: '/repo',
            host: 'machine',
            driver: 'codex',
        },
        agentState: null,
        ...(includeLiveConfigDefaults
            ? {
                  model: 'gpt-5',
                  modelReasoningEffort: 'high',
                  permissionMode: 'safe-yolo',
                  collaborationMode: 'plan',
              }
            : {}),
        ...overrides,
    })
}

function createTextMessage(role: 'user' | 'agent', text: string, attachments?: unknown): Record<string, unknown> {
    return {
        role,
        content: {
            type: 'text',
            text,
            ...(attachments ? { attachments } : {}),
        },
    }
}

function createAttachmentOnlyMessage(role: 'user' | 'agent', attachments: unknown): Record<string, unknown> {
    return {
        role,
        content: {
            type: 'other',
            attachments,
        },
    }
}

describe('session handoff service', () => {
    it('assembles a full multi-page handoff snapshot through the SyncEngine seam', () => {
        const { store, engine } = createEngineHarness()
        const session = createEngineSession(engine)
        const attachment = {
            id: 'attachment-1',
            filename: 'spec.md',
            mimeType: 'text/markdown',
            size: 42,
            path: '/repo/spec.md',
            previewUrl: '/preview/spec.md',
        }

        try {
            for (let index = 1; index <= SESSION_RECOVERY_PAGE_SIZE - 2; index += 1) {
                store.messages.addMessage(
                    session.id,
                    createTextMessage(index % 2 === 0 ? 'agent' : 'user', `message-${index}`)
                )
            }
            store.messages.addMessage(session.id, createTextMessage('user', 'bridge attachment', [attachment]))
            store.messages.addMessage(session.id, createTextMessage('agent', 'page-end assistant'))
            store.messages.addMessage(session.id, createAttachmentOnlyMessage('user', [attachment]))
            store.messages.addMessage(session.id, createTextMessage('agent', 'page-next assistant'))

            const snapshot = engine.buildSessionHandoff(session.id)

            expect(snapshot.driver).toBe('codex')
            expect(snapshot.workingDirectory).toBe('/repo')
            expect(snapshot.liveConfig).toEqual({
                model: 'gpt-5',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            })
            expect(snapshot.history).toHaveLength(SESSION_RECOVERY_PAGE_SIZE + 2)
            expect(snapshot.history[0]).toMatchObject({ seq: 1, text: 'message-1', role: 'user' })
            expect(snapshot.history[SESSION_RECOVERY_PAGE_SIZE - 2]).toMatchObject({
                seq: SESSION_RECOVERY_PAGE_SIZE - 1,
                text: 'bridge attachment',
                attachmentPaths: ['/repo/spec.md'],
            })
            expect(snapshot.history[SESSION_RECOVERY_PAGE_SIZE - 1]).toMatchObject({
                seq: SESSION_RECOVERY_PAGE_SIZE,
                text: 'page-end assistant',
                role: 'assistant',
            })
            expect(snapshot.history[SESSION_RECOVERY_PAGE_SIZE]).toMatchObject({
                seq: SESSION_RECOVERY_PAGE_SIZE + 1,
                text: '',
                role: 'user',
                attachmentPaths: ['/repo/spec.md'],
            })
            expect(snapshot.history[SESSION_RECOVERY_PAGE_SIZE + 1]).toMatchObject({
                seq: SESSION_RECOVERY_PAGE_SIZE + 2,
                text: 'page-next assistant',
                role: 'assistant',
            })
            expect(snapshot.attachments).toEqual([
                {
                    filename: 'spec.md',
                    mimeType: 'text/markdown',
                    path: '/repo/spec.md',
                    size: 42,
                },
            ])
        } finally {
            engine.stop()
        }
    })

    it('returns an empty history when the session has no transcript yet', () => {
        const { engine } = createEngineHarness()
        const session = createEngineSession(
            engine,
            {
                metadata: {
                    path: '/empty',
                    host: 'machine',
                    driver: 'claude',
                },
            },
            {
                includeLiveConfigDefaults: false,
            }
        )

        try {
            expect(engine.buildSessionHandoff(session.id)).toEqual({
                driver: 'claude',
                workingDirectory: '/empty',
                liveConfig: {
                    model: null,
                    modelReasoningEffort: null,
                    permissionMode: undefined,
                    collaborationMode: undefined,
                },
                history: [],
                attachments: [],
            })
        } finally {
            engine.stop()
        }
    })

    it('fails explicitly when the SyncEngine seam is asked for a missing session', () => {
        const { engine } = createEngineHarness()

        try {
            expect(() => engine.buildSessionHandoff('missing-session')).toThrow(
                expect.objectContaining({
                    name: 'SessionHandoffBuildError',
                    code: 'session_not_found',
                    stage: 'session_lookup',
                    sessionId: 'missing-session',
                })
            )
        } finally {
            engine.stop()
        }
    })

    it('fails explicitly when the session id input is missing', () => {
        const service = new SessionHandoffService({
            getSession: () => createSession(),
            getMessagesAfter: () => [],
        })

        expect(() => service.buildSessionHandoff('')).toThrow(
            expect.objectContaining({
                name: 'SessionHandoffBuildError',
                code: 'session_id_missing',
                stage: 'session_lookup',
                sessionId: '',
            })
        )
    })

    it('bubbles shared contract failures through the SyncEngine seam without fallback continuity', () => {
        const { store, engine } = createEngineHarness()
        const session = createEngineSession(engine)

        try {
            store.messages.addMessage(session.id, {
                role: 'user',
                content: {
                    type: 'text',
                    text: 'bad attachment payload',
                    attachments: [{ path: '/repo/spec.md' }],
                },
            })

            try {
                engine.buildSessionHandoff(session.id)
                throw new Error('expected handoff build to fail')
            } catch (error) {
                expect(error).toBeInstanceOf(SessionHandoffBuildError)
                expect(error).toMatchObject({
                    code: 'contract_build_failed',
                    stage: 'contract_validation',
                    sessionId: session.id,
                })
                expect((error as SessionHandoffBuildError).cause).toBeInstanceOf(SessionHandoffContractError)
                expect((error as SessionHandoffBuildError).cause).toMatchObject({
                    code: 'attachment_payload_invalid',
                    field: 'messages[0].content.attachments[0]',
                })
            }
        } finally {
            engine.stop()
        }
    })

    it('fails transcript traversal instead of truncating when a full page cannot advance the recovery cursor', () => {
        const stalledPage: DecryptedMessage[] = Array.from({ length: SESSION_RECOVERY_PAGE_SIZE }, (_, index) => ({
            id: `message-${index + 1}`,
            seq: null,
            localId: null,
            createdAt: index + 1,
            content: createTextMessage('user', `message-${index + 1}`),
        }))
        const service = new SessionHandoffService({
            getSession: () => createSession(),
            getMessagesAfter: () => stalledPage,
        })

        expect(() => service.buildSessionHandoff('session-1')).toThrow(
            expect.objectContaining({
                name: 'SessionHandoffBuildError',
                code: 'transcript_traversal_failed',
                stage: 'transcript_traversal',
                sessionId: 'session-1',
            })
        )
    })
})
