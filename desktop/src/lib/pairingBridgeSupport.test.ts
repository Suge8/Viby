import { describe, expect, it } from 'bun:test'
import {
    buildPairingConnectionSummary,
    describePairingConnectionState,
    describePairingSnapshotMessage,
    describePairingTransport,
    describePairingTransportBadge,
    readPairingBridgeStats,
    toIceServers,
} from './pairingBridgeSupport'

describe('pairingBridgeSupport', () => {
    it('maps broker ICE server payloads into the browser RTCPeerConnection shape', () => {
        expect(
            toIceServers([
                {
                    urls: ['stun:stun.example.com:3478'],
                    username: null,
                    credential: null,
                },
            ])
        ).toEqual([
            {
                urls: ['stun:stun.example.com:3478'],
                username: null,
                credential: null,
            },
        ])
    })

    it('keeps connection status copy aligned with the single bridge lifecycle owner', () => {
        expect(describePairingConnectionState('new')).toBe('等待手机接入。')
        expect(describePairingConnectionState('connecting')).toBe('正在建立点对点链路。')
        expect(describePairingConnectionState('connected')).toBe('手机链路已接通。')
        expect(describePairingConnectionState('disconnected')).toBe('手机已断开，等待重连。')
        expect(describePairingConnectionState('failed')).toBe('点对点链路失败，正在重试。')
        expect(describePairingConnectionState('closed')).toBe('配对链路已关闭。')
    })

    it('describes waiting, pending-approval, and approved pairing snapshots through one status owner', () => {
        expect(
            describePairingSnapshotMessage({
                id: 'pairing-1',
                state: 'waiting',
                createdAt: 1,
                updatedAt: 1,
                expiresAt: 2,
                ticketExpiresAt: 2,
                shortCode: null,
                approvalStatus: null,
                host: {},
                guest: null,
            })
        ).toBe('等待手机扫码接入。')

        expect(
            describePairingSnapshotMessage({
                id: 'pairing-1',
                state: 'claimed',
                createdAt: 1,
                updatedAt: 1,
                expiresAt: 2,
                ticketExpiresAt: 2,
                shortCode: '123456',
                approvalStatus: 'pending',
                host: {},
                guest: { label: 'Phone' },
            })
        ).toContain('123456')

        expect(
            describePairingSnapshotMessage({
                id: 'pairing-1',
                state: 'connected',
                createdAt: 1,
                updatedAt: 1,
                expiresAt: 2,
                ticketExpiresAt: 2,
                shortCode: '123456',
                approvalStatus: 'approved',
                host: {},
                guest: { label: 'Phone' },
            })
        ).toBe('正在连接手机。')
    })

    it('describes direct, relay, and unknown pairing transport stats through one owner', () => {
        expect(describePairingTransport(null)).toBe('检测链路')
        expect(
            describePairingTransport({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 38,
                restartCount: 1,
            })
        ).toBe('本机直连')
        expect(
            describePairingTransport({
                transport: 'relay',
                localCandidateType: 'relay',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 66,
                restartCount: 1,
            })
        ).toBe('安全中转')
        expect(
            describePairingTransport({
                transport: 'unknown',
                localCandidateType: null,
                remoteCandidateType: null,
                currentRoundTripTimeMs: null,
                restartCount: 0,
            })
        ).toBe('检测链路')
        expect(
            describePairingTransportBadge({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 38,
                restartCount: 1,
            })
        ).toBe('本机直连 · 38ms')
    })

    it('builds connection page device summary from bridge state', () => {
        expect(buildPairingConnectionSummary({ phase: 'idle', pairing: null, stats: null })).toEqual({
            connected: false,
            deviceCount: 0,
            title: '未连接',
            detail: '等待手机扫码',
            kind: 'empty',
            actionLabel: '连接手机',
            removable: false,
        })

        expect(
            buildPairingConnectionSummary({
                phase: 'connecting',
                pairing: {
                    id: 'pairing-1',
                    state: 'connected',
                    createdAt: 1,
                    updatedAt: 2,
                    expiresAt: 3,
                    ticketExpiresAt: 4,
                    shortCode: '123456',
                    approvalStatus: 'approved',
                    host: {},
                    guest: { label: 'iPhone' },
                },
                stats: null,
            })
        ).toEqual({
            connected: false,
            deviceCount: 1,
            title: '正在接回手机',
            detail: 'iPhone · 安全链路重建中',
            kind: 'bound',
            actionLabel: '正在接回',
            removable: true,
        })

        const paired = {
            id: 'pairing-1',
            state: 'connected',
            createdAt: 1,
            updatedAt: 2,
            expiresAt: 3,
            ticketExpiresAt: 4,
            shortCode: '123456',
            approvalStatus: 'approved' as const,
            host: {},
            guest: { label: 'iPhone' },
        }

        expect(buildPairingConnectionSummary({ phase: 'paused', pairing: paired, stats: null })).toEqual({
            connected: false,
            deviceCount: 1,
            title: '手机在后台',
            detail: '手机在后台，回来后会自动接回。',
            kind: 'bound',
            actionLabel: '等待手机回来',
            removable: true,
        })

        expect(buildPairingConnectionSummary({ phase: 'idle', pairing: paired, stats: null })).toEqual({
            connected: false,
            deviceCount: 1,
            title: '已绑定手机',
            detail: 'iPhone · 打开 Viby 后自动接回',
            kind: 'bound',
            actionLabel: '已绑定',
            removable: true,
        })

        expect(buildPairingConnectionSummary({ phase: 'error', pairing: paired, stats: null })).toEqual({
            connected: false,
            deviceCount: 1,
            title: '手机暂时离线',
            detail: '打开手机页面后会自动接回',
            kind: 'bound',
            actionLabel: '等待自动接回',
            removable: true,
        })

        expect(
            buildPairingConnectionSummary({
                phase: 'ready',
                pairing: paired,
                stats: {
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 28,
                    restartCount: 0,
                },
            })
        ).toEqual({
            connected: true,
            deviceCount: 1,
            title: '已连接',
            detail: 'iPhone · 本机直连 · 延迟 28ms',
            kind: 'bound',
            actionLabel: '连接已就绪',
            removable: true,
        })
    })

    it('keeps pending approval copy explicit when the short code has not arrived yet', () => {
        expect(
            describePairingSnapshotMessage({
                id: 'pairing-2',
                state: 'claimed',
                createdAt: 1,
                updatedAt: 1,
                expiresAt: 2,
                ticketExpiresAt: 2,
                shortCode: null,
                approvalStatus: 'pending',
                host: {},
                guest: { label: 'Mobile Safari' },
            })
        ).toBe('手机已扫码，等待输入连接码。')
    })

    it('keeps fallback snapshot copy neutral for partially claimed broker states', () => {
        expect(
            describePairingSnapshotMessage({
                id: 'pairing-3',
                state: 'claimed',
                createdAt: 1,
                updatedAt: 1,
                expiresAt: 2,
                ticketExpiresAt: 2,
                shortCode: null,
                approvalStatus: null,
                host: {},
                guest: { label: 'Phone' },
            })
        ).toBe('等待手机接入。')
    })

    it('detects relay transport from selected ICE candidate stats', async () => {
        const stats = new Map<string, Record<string, unknown>>([
            ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
            [
                'pair',
                {
                    type: 'candidate-pair',
                    localCandidateId: 'local',
                    remoteCandidateId: 'remote',
                    currentRoundTripTime: 0.045,
                },
            ],
            ['local', { type: 'local-candidate', candidateType: 'relay' }],
            ['remote', { type: 'remote-candidate', candidateType: 'srflx' }],
        ])
        stats.forEach = (callback: (value: Record<string, unknown>) => void) => {
            for (const value of stats.values()) {
                callback(value)
            }
        }
        const peer = {
            getStats: async () => stats,
        } as unknown as RTCPeerConnection

        await expect(readPairingBridgeStats(peer, 3)).resolves.toMatchObject({
            transport: 'relay',
            localCandidateType: 'relay',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 45,
            restartCount: 3,
        })
    })

    it('keeps selected ICE candidate stats unknown when candidate types are missing', async () => {
        const stats = new Map<string, Record<string, unknown>>([
            ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
            [
                'pair',
                {
                    type: 'candidate-pair',
                    localCandidateId: 'local',
                    remoteCandidateId: 'remote',
                },
            ],
            ['local', { type: 'local-candidate' }],
            ['remote', { type: 'remote-candidate' }],
        ])
        stats.forEach = (callback: (value: Record<string, unknown>) => void) => {
            for (const value of stats.values()) {
                callback(value)
            }
        }
        const peer = {
            getStats: async () => stats,
        } as unknown as RTCPeerConnection

        await expect(readPairingBridgeStats(peer, 0)).resolves.toMatchObject({
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
        })
    })
})
