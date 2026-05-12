import { describe, expect, it } from 'bun:test'
import type { PairingPeerRequest } from '@viby/protocol/pairing'
import {
    executePairingPeerRequest,
    isPairingHeartbeat,
    parsePairingPeerRequest,
    serializePairingSyncEvent,
} from './pairingBridgeCore'

describe('pairingBridgeCore', () => {
    it('maps session list requests onto the narrow remote summary contract', async () => {
        const client = {
            listSessions: async () => [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    activeAt: 1,
                    updatedAt: 2,
                    latestActivityAt: 3,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 3,
                    lifecycleState: 'running',
                    lifecycleStateSince: 2,
                    metadata: {
                        path: '/tmp/project',
                        driver: 'codex',
                    },
                    todoProgress: null,
                    pendingRequestsCount: 0,
                    resumeAvailable: true,
                    resumeStrategy: 'provider-handle',
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'high',
                    codexServiceTier: null,
                },
            ],
        }

        const response = await executePairingPeerRequest(
            client as never,
            parsePairingPeerRequest(
                JSON.stringify({
                    kind: 'request',
                    id: 'req-1',
                    method: 'sessions.list',
                    params: {},
                } satisfies PairingPeerRequest)
            )
        )

        expect(response).toMatchObject({
            kind: 'response',
            id: 'req-1',
            ok: true,
            result: {
                sessions: [
                    {
                        id: 'session-1',
                        metadata: {
                            path: '/tmp/project',
                            driver: 'codex',
                        },
                    },
                ],
            },
        })
    })

    it('serializes sync events into peer event envelopes', () => {
        expect(
            JSON.parse(
                serializePairingSyncEvent({
                    type: 'session-updated',
                    sessionId: 'session-1',
                    data: { sid: 'session-1' },
                })
            )
        ).toEqual({
            kind: 'event',
            event: 'sync-event',
            payload: {
                type: 'session-updated',
                sessionId: 'session-1',
                data: { sid: 'session-1' },
            },
        })
    })

    it('recognizes peer heartbeat frames and rejects other payloads', () => {
        expect(isPairingHeartbeat(JSON.stringify({ kind: 'heartbeat' }))).toBe(true)
        expect(isPairingHeartbeat('{"kind":"request","id":"x","method":"sessions.list","params":{}}')).toBe(false)
        expect(isPairingHeartbeat('not-json')).toBe(false)
    })
})
