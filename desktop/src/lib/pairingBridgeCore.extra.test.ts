import { describe, expect, it } from 'bun:test'
import type { PairingPeerRequest } from '@viby/protocol/pairing'
import { executePairingPeerRequest, parsePairingPeerRequest, serializePairingPeerMessage } from './pairingBridgeCore'

function parseRequest(payload: PairingPeerRequest) {
    return parsePairingPeerRequest(JSON.stringify(payload))
}

function createSessionRecord(id: string) {
    return {
        id,
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: {
            name: `${id} name`,
            path: `/tmp/${id}`,
            host: 'localhost',
            driver: 'codex' as const,
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high' as const,
        permissionMode: 'safe-yolo' as const,
        collaborationMode: 'default' as const,
        resumeAvailable: true,
    }
}

function createSessionView(id: string) {
    return {
        session: createSessionRecord(id),
        latestWindow: {
            messages: [],
            page: {
                limit: 50,
                beforeSeq: null,
                nextBeforeSeq: null,
                hasMore: false,
            },
        },
        stream: null,
        watermark: {
            latestSeq: 0,
            updatedAt: 1,
        },
        interactivity: {
            lifecycleState: 'running' as const,
            resumeAvailable: true,
            allowSendWhenInactive: false,
            retryAvailable: false,
        },
    }
}

describe('pairingBridgeCore extra request coverage', () => {
    it('maps session.open onto the local Hub client and preserves the returned snapshot', async () => {
        const view = createSessionView('session-opened')
        const client = {
            openSession: async (sessionId: string) => {
                expect(sessionId).toBe('session-opened')
                return view
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-open',
                    method: 'session.open',
                    params: { sessionId: 'session-opened' },
                })
            )
        ).resolves.toMatchObject({
            kind: 'response',
            id: 'req-open',
            ok: true,
            result: view,
        })
    })

    it('maps session.resume and session.load-after through the same bridge contract', async () => {
        const resumedView = {
            ...createSessionView('session-resume'),
            latestWindow: {
                messages: [
                    {
                        id: 'm-1',
                        seq: 1,
                        localId: 'local-1',
                        createdAt: 1,
                        sessionId: 'session-resume',
                        kind: 'user',
                        content: 'hello',
                    },
                ],
                page: {
                    limit: 50,
                    beforeSeq: null,
                    nextBeforeSeq: null,
                    hasMore: false,
                },
            },
        }
        const client = {
            resumeSession: async (sessionId: string) => {
                expect(sessionId).toBe('session-resume')
                return resumedView
            },
            loadMessagesAfter: async (sessionId: string, afterSeq: number, limit: number) => {
                expect(sessionId).toBe('session-resume')
                expect(afterSeq).toBe(41)
                expect(limit).toBe(25)
                return {
                    messages: [
                        {
                            id: 'm-2',
                            seq: 42,
                            localId: 'local-2',
                            createdAt: 2,
                            sessionId: 'session-resume',
                            kind: 'assistant',
                            content: 'reply',
                        },
                    ],
                    nextAfterSeq: 42,
                }
            },
        }

        const resumeResponse = await executePairingPeerRequest(
            client as never,
            parseRequest({
                kind: 'request',
                id: 'req-resume',
                method: 'session.resume',
                params: { sessionId: 'session-resume' },
            })
        )

        expect(resumeResponse).toMatchObject({
            id: 'req-resume',
            ok: true,
            result: {
                session: {
                    id: 'session-resume',
                    metadata: {
                        path: '/tmp/session-resume',
                    },
                },
                latestWindow: {
                    messages: [{ id: 'm-1' }],
                },
            },
        })

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-load-after',
                    method: 'session.load-after',
                    params: { sessionId: 'session-resume', afterSeq: 41, limit: 25 },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-load-after',
            ok: true,
            result: {
                messages: [{ id: 'm-2', seq: 42 }],
                nextAfterSeq: 42,
            },
        })
    })

    it('maps session.send into the authoritative send path and returns the refreshed session view', async () => {
        const refreshedSession = createSessionRecord('session-send')
        const client = {
            sendMessage: async (sessionId: string, text: string, localId: string) => {
                expect(sessionId).toBe('session-send')
                expect(text).toBe('hello from phone')
                expect(localId).toBe('mobile-1')
                return refreshedSession
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-send',
                    method: 'session.send',
                    params: {
                        sessionId: 'session-send',
                        text: 'hello from phone',
                        localId: 'mobile-1',
                    },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-send',
            ok: true,
            result: {
                session: {
                    id: refreshedSession.id,
                    metadata: {
                        path: refreshedSession.metadata.path,
                    },
                },
            },
        })
    })

    it('returns a typed pairing error payload when the local Hub request fails', async () => {
        const client = {
            openSession: async () => {
                throw new Error('desktop hub offline')
            },
        }

        await expect(
            executePairingPeerRequest(
                client as never,
                parseRequest({
                    kind: 'request',
                    id: 'req-error',
                    method: 'session.open',
                    params: { sessionId: 'session-error' },
                })
            )
        ).resolves.toMatchObject({
            id: 'req-error',
            ok: false,
            error: {
                code: 'pairing_peer_request_failed',
                message: 'desktop hub offline',
            },
        })
    })

    it('serializes successful peer responses through the shared envelope schema', () => {
        expect(
            JSON.parse(
                serializePairingPeerMessage({
                    kind: 'response',
                    id: 'req-serialized',
                    ok: true,
                    result: {
                        sessions: [],
                    },
                })
            )
        ).toEqual({
            kind: 'response',
            id: 'req-serialized',
            ok: true,
            result: {
                sessions: [],
            },
        })
    })
})
