import { describe, expect, it } from 'bun:test'
import {
    describePairingConnectionState,
    describePairingSnapshotMessage,
    describePairingTransport,
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
                {
                    urls: ['turn:turn.example.com:3478?transport=udp'],
                    username: 'user-1',
                    credential: 'secret-1',
                },
            ])
        ).toEqual([
            {
                urls: ['stun:stun.example.com:3478'],
                username: null,
                credential: null,
            },
            {
                urls: ['turn:turn.example.com:3478?transport=udp'],
                username: 'user-1',
                credential: 'secret-1',
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
        ).toBe('桌面已批准接入，正在建立点对点链路。')
    })

    it('describes direct, relay, and unknown pairing transport stats through one owner', () => {
        expect(describePairingTransport(null)).toBe('采样中')
        expect(
            describePairingTransport({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 38,
                restartCount: 1,
            })
        ).toBe('P2P Direct')
        expect(
            describePairingTransport({
                transport: 'relay',
                localCandidateType: 'relay',
                remoteCandidateType: 'relay',
                currentRoundTripTimeMs: 82,
                restartCount: 2,
            })
        ).toBe('TURN Relay')
    })
})
