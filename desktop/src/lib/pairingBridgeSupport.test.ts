import { describe, expect, it } from 'bun:test'
import type { PairingBridgeStats, PairingSessionSnapshot } from '@/types'
import {
    buildPairingConnectionSummary,
    describePairingConnectionState,
    describePairingSnapshotMessage,
    describePairingTransport,
    describePairingTransportBadge,
    isStalePairingBridgeState,
    readPairingBridgeStats,
    toIceServers,
} from './pairingBridgeSupport'

const BOUND_BASE = {
    connected: false,
    deviceCount: 1,
    kind: 'bound' as const,
    actionLabel: '显示手机入口',
    removable: true,
}

function pairingSnapshot(overrides: Partial<PairingSessionSnapshot> = {}): PairingSessionSnapshot {
    return {
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
        ...overrides,
    }
}

function createStatsPeer(entries: [string, Record<string, unknown>][]): RTCPeerConnection {
    const stats = new Map<string, Record<string, unknown>>(entries)
    stats.forEach = (callback: (value: Record<string, unknown>) => void) => {
        for (const value of stats.values()) callback(value)
    }
    return { getStats: async () => stats } as unknown as RTCPeerConnection
}

function bridgeStats(overrides: Partial<PairingBridgeStats>): PairingBridgeStats {
    return {
        transport: 'unknown',
        localCandidateType: null,
        remoteCandidateType: null,
        currentRoundTripTimeMs: null,
        restartCount: 0,
        ...overrides,
    }
}

describe('pairingBridgeSupport', () => {
    it('maps broker ICE server payloads into the browser RTCPeerConnection shape', () => {
        expect(toIceServers([{ urls: ['stun:stun.example.com:3478'], username: null, credential: null }])).toEqual([
            { urls: ['stun:stun.example.com:3478'], username: null, credential: null },
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
        expect(describePairingSnapshotMessage(pairingSnapshot())).toBe('等待手机扫码接入。')
        expect(
            describePairingSnapshotMessage(
                pairingSnapshot({
                    state: 'claimed',
                    shortCode: '123456',
                    approvalStatus: 'pending',
                    guest: { label: 'Phone' },
                })
            )
        ).toContain('123456')
        expect(
            describePairingSnapshotMessage(
                pairingSnapshot({
                    state: 'connected',
                    shortCode: '123456',
                    approvalStatus: 'approved',
                    guest: { label: 'Phone' },
                })
            )
        ).toBe('已绑定手机，等待手机页面接入。')
    })

    it('describes direct, relay, and unknown pairing transport stats through one owner', () => {
        expect(describePairingTransport(null)).toBe('检测链路')
        expect(
            describePairingTransport(
                bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 38,
                    restartCount: 1,
                })
            )
        ).toBe('本机直连')
        expect(
            describePairingTransport(
                bridgeStats({
                    transport: 'relay',
                    localCandidateType: 'relay',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 66,
                    restartCount: 1,
                })
            )
        ).toBe('安全中转')
        expect(describePairingTransport(bridgeStats({}))).toBe('检测链路')
        expect(
            describePairingTransportBadge(
                bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 38,
                    restartCount: 1,
                })
            )
        ).toBe('本机直连 · 38ms')
    })

    it('builds connection page device summary from bridge state', () => {
        const paired = pairingSnapshot({
            state: 'connected',
            updatedAt: 2,
            expiresAt: 3,
            ticketExpiresAt: 4,
            shortCode: '123456',
            approvalStatus: 'approved',
            guest: { label: 'iPhone' },
        })

        expect(buildPairingConnectionSummary({ phase: 'idle', pairing: null, stats: null })).toEqual({
            connected: false,
            deviceCount: 0,
            title: '未连接',
            detail: '等待手机扫码',
            kind: 'empty',
            actionLabel: '连接手机',
            removable: false,
        })
        expect(buildPairingConnectionSummary({ phase: 'connecting', pairing: paired, stats: null })).toEqual({
            ...BOUND_BASE,
            title: '已绑定',
            detail: '打开手机页面后自动连接',
        })
        expect(buildPairingConnectionSummary({ phase: 'paused', pairing: paired, stats: null })).toEqual({
            ...BOUND_BASE,
            title: '手机在后台',
            detail: '手机在后台，回来后会自动接回。',
        })
        expect(buildPairingConnectionSummary({ phase: 'idle', pairing: paired, stats: null })).toEqual({
            ...BOUND_BASE,
            title: '已绑定',
            detail: '开启中枢后自动连接',
        })
        expect(buildPairingConnectionSummary({ phase: 'error', pairing: paired, stats: null })).toEqual({
            ...BOUND_BASE,
            title: '已绑定',
            detail: '打开手机页面后自动连接',
        })
        expect(
            buildPairingConnectionSummary({
                phase: 'error',
                message: '当前配对已过期或被删除。',
                pairing: paired,
                stats: null,
            })
        ).toEqual({ ...BOUND_BASE, title: '绑定已失效', detail: '请重新扫码' })
        expect(
            buildPairingConnectionSummary({
                phase: 'ready',
                pairing: paired,
                stats: bridgeStats({
                    transport: 'direct',
                    localCandidateType: 'host',
                    remoteCandidateType: 'srflx',
                    currentRoundTripTimeMs: 28,
                }),
            })
        ).toEqual({
            ...BOUND_BASE,
            connected: true,
            title: '已连接',
            detail: 'iPhone · 本机直连 · 延迟 28ms',
        })
    })

    it('keeps pending approval copy explicit when the short code has not arrived yet', () => {
        expect(
            describePairingSnapshotMessage(
                pairingSnapshot({ state: 'claimed', approvalStatus: 'pending', guest: { label: 'Mobile Safari' } })
            )
        ).toBe('手机已扫码，等待输入连接码。')
    })

    it('keeps fallback snapshot copy neutral for partially claimed broker states', () => {
        expect(describePairingSnapshotMessage(pairingSnapshot({ state: 'claimed', guest: { label: 'Phone' } }))).toBe(
            '等待手机接入。'
        )
    })

    it('detects stale bridge errors without treating transient errors as expired pairings', () => {
        expect(isStalePairingBridgeState({ phase: 'error', message: '当前配对已过期或被删除。' })).toBe(true)
        expect(isStalePairingBridgeState({ phase: 'error', message: '配对信令出错。' })).toBe(false)
        expect(isStalePairingBridgeState({ phase: 'connecting', message: '当前配对已过期或被删除。' })).toBe(false)
    })

    it('detects relay transport from selected ICE candidate stats', async () => {
        const peer = createStatsPeer([
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

        await expect(readPairingBridgeStats(peer, 3)).resolves.toMatchObject({
            transport: 'relay',
            localCandidateType: 'relay',
            remoteCandidateType: 'srflx',
            currentRoundTripTimeMs: 45,
            restartCount: 3,
        })
    })

    it('keeps selected ICE candidate stats unknown when candidate types are missing', async () => {
        const peer = createStatsPeer([
            ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
            ['pair', { type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote' }],
            ['local', { type: 'local-candidate' }],
            ['remote', { type: 'remote-candidate' }],
        ])

        await expect(readPairingBridgeStats(peer, 0)).resolves.toMatchObject({
            transport: 'unknown',
            localCandidateType: null,
            remoteCandidateType: null,
            currentRoundTripTimeMs: null,
        })
    })
})
