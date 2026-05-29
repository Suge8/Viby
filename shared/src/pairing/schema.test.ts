import { describe, expect, it } from 'bun:test'
import { PROTOCOL_VERSION } from '../version'
import {
    buildPairingLinkPresentation,
    classifyPairingLinkQuality,
    describePairingDirectBlockedReason,
    describePairingLinkTransport,
    formatPairingRoundTripTime,
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    PairingPeerBrowseDirectoryResultSchema,
    PairingPeerCommandCapabilitiesResultSchema,
    PairingPeerEventSchema,
    PairingPeerGitCommandResultSchema,
    PairingPeerListSessionsResultSchema,
    PairingPeerMessageSchema,
    PairingPeerMessagesResultSchema,
    PairingPeerMethodSchema,
    PairingPeerOpenSessionResultSchema,
    PairingPeerPathsExistResultSchema,
    PairingPeerRequestSchema,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingPwaHandoffTicketResponseSchema,
    PairingReconnectChallengeResponseSchema,
    PairingReconnectRequestSchema,
    PairingSessionStateSchema,
    PairingTelemetryRequestSchema,
    resolvePairingLinkTransport,
} from './schema'

describe('pairing peer rpc schema', () => {
    it('keeps broker session states on the canonical v2 set only', () => {
        expect(PairingSessionStateSchema.options).toEqual(['active', 'waiting', 'deleted', 'expired'])
        expect(PairingSessionStateSchema.safeParse('claimed').success).toBe(false)
        expect(PairingSessionStateSchema.safeParse('connected').success).toBe(false)
    })

    it('derives peer method names from the request schemas instead of a second list', () => {
        const requestMethods = PairingPeerRequestSchema.options.map((schema) => schema.shape.method.value)
        expect(PairingPeerMethodSchema.options).toEqual(requestMethods)
        expect(new Set(PairingPeerMethodSchema.options).size).toBe(PairingPeerMethodSchema.options.length)
    })

    it('carries peer protocol version on heartbeat frames', () => {
        expect(PairingPeerMessageSchema.parse({ kind: 'heartbeat', protocolVersion: PROTOCOL_VERSION })).toEqual({
            kind: 'heartbeat',
            protocolVersion: PROTOCOL_VERSION,
        })
    })

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
                    codexServiceTier: null,
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
                codexServiceTier: null,
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

        expect(
            PairingPeerOpenSessionResultSchema.parse({
                session: openResult.session,
                stream: openResult.stream,
                watermark: openResult.watermark,
                interactivity: openResult.interactivity,
            }).session.id
        ).toBe('session-1')
        expect(openResult.session.id).toBe('session-1')
        expect(
            PairingPeerMessagesResultSchema.parse({
                messages: [],
                page: { limit: 50, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
            }).page.limit
        ).toBe(50)
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

    it('accepts remote runtime browse and path existence contracts', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'req-browse',
                method: 'runtime.browse-directory',
                params: { path: '/tmp/project' },
            }).kind
        ).toBe('request')
        expect(
            PairingPeerBrowseDirectoryResultSchema.parse({
                success: true,
                currentPath: '/tmp/project',
                parentPath: '/tmp',
                entries: [{ name: 'src', path: '/tmp/project/src', type: 'directory' }],
                roots: [{ kind: 'home', path: '/Users/example' }],
            }).entries?.[0]?.name
        ).toBe('src')
        expect(PairingPeerPathsExistResultSchema.parse({ exists: { '/tmp/project': true } }).exists).toEqual({
            '/tmp/project': true,
        })
    })

    it('accepts mobile management and workspace peer contracts', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'req-close',
                method: 'session.close',
                params: { sessionId: 'session-1' },
            }).kind
        ).toBe('request')
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'req-read',
                method: 'workspace.read-file',
                params: { sessionId: 'session-1', path: 'src/index.ts' },
            }).kind
        ).toBe('request')
        expect(PairingPeerGitCommandResultSchema.parse({ success: true, stdout: ' M file.ts' }).success).toBe(true)
        expect(PairingPeerCommandCapabilitiesResultSchema.parse({ success: true, capabilities: [] }).success).toBe(true)
    })

    it('accepts mobile upload, terminal and push peer contracts', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'upload-start',
                method: 'session.upload-start',
                params: {
                    sessionId: 'session-1',
                    transferId: '00000000-0000-4000-8000-000000000001',
                    filename: 'image.png',
                    mimeType: 'image/png',
                    size: 12,
                },
            }).kind
        ).toBe('request')
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'terminal-open',
                method: 'terminal.open',
                params: { sessionId: 'session-1', terminalId: 'terminal-1', cols: 80, rows: 24 },
            }).kind
        ).toBe('request')
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'event',
                event: 'terminal-event',
                payload: { type: 'output', sessionId: 'session-1', terminalId: 'terminal-1', data: 'hello' },
            }).kind
        ).toBe('event')
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'push-subscribe',
                method: 'push.subscribe',
                params: { endpoint: 'https://push.example', keys: { p256dh: 'p', auth: 'a' } },
            }).kind
        ).toBe('request')
    })

    it('accepts reconnect requests with an optional signed device proof', () => {
        const deviceRecovery = PairingDeviceReconnectRequestSchema.parse({
            deviceProof: {
                publicKey: 'spki-public-key',
                challengeNonce: 'challenge-nonce',
                signedAt: 1_700_000_000_000,
                signature: 'signature-value',
            },
        })
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

        expect(PairingDeviceReconnectChallengeRequestSchema.parse({ publicKey: 'spki-public-key' }).publicKey).toBe(
            'spki-public-key'
        )
        expect(PairingPwaHandoffTicketRequestSchema.parse(parsed).deviceProof.publicKey).toBe('spki-public-key')
        expect(
            PairingPwaHandoffTicketResponseSchema.parse({ handoffTicket: 'handoff-ticket', expiresAt: 1 }).handoffTicket
        ).toBe('handoff-ticket')
        expect(
            PairingPwaHandoffClaimRequestSchema.parse({
                handoffTicket: 'handoff-ticket',
                label: 'Device PWA',
                publicKey: 'new-spki-public-key',
            }).publicKey
        ).toBe('new-spki-public-key')
        expect(deviceRecovery.deviceProof.publicKey).toBe('spki-public-key')
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
                transportMode: 'relay-wss',
                localCandidateType: 'relay',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 92,
                restartCount: 2,
                routeRevision: 3,
                directBlockedReason: 'turn-candidate',
                sampledAt: 1_700_000_000_000,
            },
        })

        expect(challenge.challenge.nonce).toBe('nonce-1')
        expect(telemetry.sample.transport).toBe('relay')
    })

    it('classifies pairing link quality from transport and RTT', () => {
        expect(
            classifyPairingLinkQuality({ transport: 'direct', currentRoundTripTimeMs: 38, sampledAt: Date.now() })
        ).toMatchObject({
            tone: 'success',
            latencyTier: 'fast',
            roundTripTimeMs: 38,
        })
        expect(
            classifyPairingLinkQuality({ transport: 'relay', currentRoundTripTimeMs: 120, sampledAt: Date.now() })
        ).toMatchObject({
            tone: 'warning',
            latencyTier: 'steady',
        })
        expect(classifyPairingLinkQuality({ transport: 'relay', currentRoundTripTimeMs: 5 })).toMatchObject({
            latencyTier: 'unknown',
            roundTripTimeMs: null,
        })
        expect(classifyPairingLinkQuality({ transport: 'unknown', currentRoundTripTimeMs: null })).toMatchObject({
            tone: 'neutral',
            latencyTier: 'unknown',
        })
        expect(
            classifyPairingLinkQuality({ transport: 'direct', currentRoundTripTimeMs: 240, sampledAt: Date.now() })
        ).toMatchObject({
            tone: 'warning',
            latencyTier: 'slow',
            roundTripTimeMs: 240,
        })
        expect(formatPairingRoundTripTime(37.7)).toBe('38ms')
        expect(formatPairingRoundTripTime(-1)).toBe('0ms')
        expect(describePairingLinkTransport({ transport: 'relay' })).toBe('安全中转')
        expect(describePairingDirectBlockedReason('turn-candidate')).toBe('网络只能选到中转候选')
        expect(resolvePairingLinkTransport({ localCandidateType: 'host', remoteCandidateType: 'srflx' })).toBe('direct')
        expect(resolvePairingLinkTransport({ localCandidateType: null, remoteCandidateType: 'srflx' })).toBe('unknown')
        expect(resolvePairingLinkTransport({ localCandidateType: null, remoteCandidateType: 'relay' })).toBe('relay')
        expect(
            buildPairingLinkPresentation({ transport: 'direct', currentRoundTripTimeMs: 38, sampledAt: Date.now() })
        ).toEqual({
            title: '点对点直连 · 延迟 38ms',
            detail: '最快路线。延迟数字越小，设备操作越跟手。',
            tone: 'success',
        })
        expect(
            buildPairingLinkPresentation({ transport: 'direct', currentRoundTripTimeMs: 240, sampledAt: Date.now() })
        ).toEqual({
            title: '点对点直连 · 延迟 240ms',
            detail: '最快路线。延迟数字越小，设备操作越跟手。',
            tone: 'warning',
        })
        expect(
            buildPairingLinkPresentation({ transport: 'relay', currentRoundTripTimeMs: 120, sampledAt: Date.now() })
        ).toEqual({
            title: '安全中转 · 延迟 120ms',
            detail: '两边网络不能直连时自动绕路；能正常用，不用手动设置。',
            tone: 'warning',
        })
        expect(
            buildPairingLinkPresentation({
                transport: 'relay',
                currentRoundTripTimeMs: 120,
                directBlockedReason: 'direct-slower-than-relay',
                sampledAt: Date.now(),
            })
        ).toMatchObject({
            detail: 'WebRTC 路径比当前中转慢；已自动走安全中转。',
        })
        expect(buildPairingLinkPresentation({ transport: 'unknown', currentRoundTripTimeMs: null })).toEqual({
            title: '已连接 · 正在检测链路',
            detail: '不影响使用；Viby 正在确认是点对点直连还是安全中转。',
            tone: 'neutral',
        })
        expect(buildPairingLinkPresentation(null)).toEqual({
            title: '正在检测链路',
            detail: '已连接后会确认是点对点直连还是安全中转。',
            tone: 'neutral',
        })
    })
})
