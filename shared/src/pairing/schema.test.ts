import { describe, expect, it } from 'bun:test'
import {
    PairingPeerEventSchema,
    PairingPeerListSessionsResultSchema,
    PairingPeerMessageSchema,
    PairingPeerOpenSessionResultSchema,
    PairingReconnectChallengeResponseSchema,
    PairingReconnectRequestSchema,
    PairingTelemetryRequestSchema,
} from './schema'

describe('pairing peer rpc schema', () => {
    it('accepts narrow remote session summaries for session lists', () => {
        const parsed = PairingPeerListSessionsResultSchema.parse({
            sessions: [
                {
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    updatedAt: 1_700_000_000_000,
                    latestActivityAt: null,
                    lifecycleState: 'running',
                    resumeAvailable: true,
                    model: 'gpt-5.4',
                    metadata: {
                        path: '/tmp/project',
                        driver: 'codex',
                        summary: {
                            text: 'recent summary',
                            updatedAt: 1_700_000_000_000,
                        },
                    },
                },
            ],
        })

        expect(parsed.sessions[0]?.metadata?.driver).toBe('codex')
    })

    it('accepts open-session snapshots and sync-event envelopes', () => {
        const openResult = PairingPeerOpenSessionResultSchema.parse({
            session: {
                id: 'session-1',
                seq: 1,
                createdAt: 1,
                updatedAt: 1,
                active: true,
                activeAt: 1,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                },
                metadataVersion: 1,
                agentState: null,
                agentStateVersion: 0,
                thinking: false,
                thinkingAt: 1,
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'default',
                resumeAvailable: true,
            },
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
                lifecycleState: 'running',
                resumeAvailable: true,
                allowSendWhenInactive: false,
                retryAvailable: false,
            },
        })

        const eventEnvelope = PairingPeerEventSchema.parse({
            kind: 'event',
            event: 'sync-event',
            payload: {
                type: 'session-updated',
                sessionId: 'session-1',
                data: { sid: 'session-1' },
            },
        })

        expect(openResult.session.id).toBe('session-1')
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'response',
                id: 'req-1',
                ok: true,
                result: openResult,
            }).kind
        ).toBe('response')
        expect(eventEnvelope.payload.type).toBe('session-updated')
    })

    it('accepts reconnect requests with an optional signed device proof', () => {
        const parsed = PairingReconnectRequestSchema.parse({
            token: 'guest-token',
            challengeNonce: 'challenge-nonce',
            deviceProof: {
                publicKey: 'spki-public-key',
                challengeNonce: 'challenge-nonce',
                signedAt: 1_700_000_000_000,
                signature: 'signature-value',
            },
        })

        expect(parsed.deviceProof?.publicKey).toBe('spki-public-key')
    })

    it('accepts reconnect challenge responses and pairing telemetry samples', () => {
        const challenge = PairingReconnectChallengeResponseSchema.parse({
            role: 'guest',
            challenge: {
                nonce: 'nonce-1',
                issuedAt: 1_700_000_000_000,
                expiresAt: 1_700_000_060_000,
            },
        })
        const telemetry = PairingTelemetryRequestSchema.parse({
            sample: {
                source: 'desktop',
                transport: 'relay',
                localCandidateType: 'relay',
                remoteCandidateType: 'relay',
                currentRoundTripTimeMs: 92,
                restartCount: 2,
                sampledAt: 1_700_000_000_000,
            },
        })

        expect(challenge.challenge.nonce).toBe('nonce-1')
        expect(telemetry.sample.transport).toBe('relay')
    })
})
