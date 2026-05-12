import { describe, expect, it } from 'bun:test'
import { buildPairingDeviceLinkStatus } from './pairingLinkQuality'

describe('buildPairingDeviceLinkStatus', () => {
    it('reports direct transport with latency when bridge is ready and stats land direct', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: {
                    phase: 'ready',
                    stats: { transport: 'direct', currentRoundTripTimeMs: 28 },
                },
            })
        ).toEqual({ phase: 'direct', title: '点对点直连 · 28ms', tone: 'success', latencyMs: 28 })
    })

    it('reports relay transport with latency when stats land on TURN', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: {
                    phase: 'ready',
                    stats: { transport: 'relay', currentRoundTripTimeMs: 120 },
                },
            })
        ).toEqual({ phase: 'relay', title: '安全中转 · 120ms', tone: 'warning', latencyMs: 120 })
    })

    it('falls back to a connected success label when ready bridge has no stats yet', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: { phase: 'ready', stats: null },
            })
        ).toEqual({ phase: 'measuring', title: '已连接', tone: 'success', latencyMs: null })
    })

    it('keeps the connected success label when ready stats still report unknown transport', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: { phase: 'ready', stats: { transport: 'unknown', currentRoundTripTimeMs: null } },
            })
        ).toEqual({ phase: 'measuring', title: '已连接', tone: 'success', latencyMs: null })
    })

    it('surfaces handshake, paused, and failed lifecycle states from the bridge', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: false,
                bridge: { phase: 'connecting', stats: null },
            })
        ).toEqual({ phase: 'handshaking', title: '正在握手', tone: 'neutral', latencyMs: null })

        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: { phase: 'paused', stats: null },
            })
        ).toEqual({ phase: 'paused', title: '等待回连', tone: 'warning', latencyMs: null })

        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: { phase: 'error', stats: null },
            })
        ).toEqual({ phase: 'failed', title: '链路异常', tone: 'danger', latencyMs: null })
    })

    it('shows the transition direction while ICE renegotiates from relay so users see progress, not silence', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: {
                    phase: 'ready',
                    stats: { transport: 'unknown', currentRoundTripTimeMs: null, previousTransport: 'relay' },
                },
            })
        ).toEqual({ phase: 'handshaking', title: '正在尝试升级至点对点直连', tone: 'neutral', latencyMs: null })
    })

    it('shows the transition direction while ICE renegotiates from direct so users know the link is being rebuilt', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: {
                    phase: 'ready',
                    stats: { transport: 'unknown', currentRoundTripTimeMs: null, previousTransport: 'direct' },
                },
            })
        ).toEqual({ phase: 'handshaking', title: '正在重选点对点路径', tone: 'neutral', latencyMs: null })
    })

    it('falls back to channel labels when the bridge is idle or absent', () => {
        expect(
            buildPairingDeviceLinkStatus({
                channel: 'scan',
                active: true,
                bridge: { phase: 'idle', stats: null },
            })
        ).toEqual({ phase: 'public', title: '公网', tone: 'success', latencyMs: null })

        expect(buildPairingDeviceLinkStatus({ channel: 'scan', active: false, bridge: null })).toEqual({
            phase: 'public',
            title: '公网',
            tone: 'neutral',
            latencyMs: null,
        })
    })

    it('maps LAN and local channels to their canonical labels', () => {
        expect(buildPairingDeviceLinkStatus({ channel: 'link', active: true, bridge: null })).toEqual({
            phase: 'lan',
            title: '局域网',
            tone: 'success',
            latencyMs: null,
        })
        expect(buildPairingDeviceLinkStatus({ channel: 'link', active: false, bridge: null })).toEqual({
            phase: 'lan',
            title: '局域网',
            tone: 'neutral',
            latencyMs: null,
        })
        expect(buildPairingDeviceLinkStatus({ channel: 'local', active: true, bridge: null })).toEqual({
            phase: 'local',
            title: '本机',
            tone: 'neutral',
            latencyMs: null,
        })
    })

    it('returns an unknown phase when the channel is missing', () => {
        expect(buildPairingDeviceLinkStatus({ channel: null, active: true, bridge: null })).toEqual({
            phase: 'unknown',
            title: '已连接',
            tone: 'neutral',
            latencyMs: null,
        })
        expect(buildPairingDeviceLinkStatus({ channel: null, active: false, bridge: null })).toEqual({
            phase: 'unknown',
            title: '已离线',
            tone: 'neutral',
            latencyMs: null,
        })
    })
})
