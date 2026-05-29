import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemotePairingLinkBadge } from './RemotePairingLinkBadge'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import type { RemotePeerTransportStats } from './remotePairingStats'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, params?: Record<string, string | number>) => {
            const translations: Record<string, string> = {
                'remotePairing.linkBadge.detecting': '检测链路',
                'remotePairing.linkBadge.measuring': '测速中',
                'remotePairing.linkBadge.transport.direct': '点对点直连',
                'remotePairing.linkBadge.transport.relay': '安全中转',
            }
            return (translations[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => String(params?.[name] ?? match))
        },
    }),
}))

type TestBridge = RemotePeerBridge & {
    emitTransport(): void
    setStats(stats: RemotePeerTransportStats): void
    transportSubscribe(listener: () => void): () => void
}

function bridgeWithStats(initialStats: RemotePeerTransportStats): TestBridge {
    let stats = initialStats
    const listeners = new Set<() => void>()
    return {
        getTransportStats: vi.fn(async () => stats),
        transportSubscribe: vi.fn((listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        }),
        emitTransport: () => {
            for (const listener of listeners) listener()
        },
        setStats: (nextStats: RemotePeerTransportStats) => {
            stats = nextStats
        },
    } as unknown as TestBridge
}

function transportStats(overrides: Partial<RemotePeerTransportStats>): RemotePeerTransportStats {
    return {
        transport: 'direct',
        transportMode: 'direct-webrtc',
        localCandidateType: null,
        remoteCandidateType: null,
        currentRoundTripTimeMs: null,
        previousTransport: null,
        sampledAt: Date.now(),
        staleAfterMs: 15_000,
        routeRevision: 0,
        directBlockedReason: null,
        directProbe: null,
        ...overrides,
    }
}

describe('RemotePairingLinkBadge', () => {
    afterEach(() => {
        cleanup()
        document.body.innerHTML = ''
    })

    it('renders the current transport and latency from the bridge owner', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 42,
                sampledAt: Date.now(),
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        expect(await screen.findByText('点对点直连')).toBeInTheDocument()
        expect(screen.getByText('42ms')).toBeInTheDocument()
    })

    it('updates from transport subscription without owning a second route state', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'direct',
                localCandidateType: 'host',
                remoteCandidateType: 'srflx',
                currentRoundTripTimeMs: 42,
                sampledAt: Date.now(),
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)
        await screen.findByText('42ms')

        bridge.setStats(
            transportStats({
                transport: 'relay',
                transportMode: 'relay-wss',
                localCandidateType: null,
                remoteCandidateType: null,
                currentRoundTripTimeMs: 128,
                sampledAt: Date.now(),
            })
        )
        act(() => bridge.emitTransport())

        await waitFor(() => expect(screen.getByText('安全中转')).toBeInTheDocument())
        expect(screen.getByText('128ms')).toBeInTheDocument()
    })

    it('keeps direct promotion reasons out of the user-facing badge', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'relay',
                transportMode: 'relay-wss',
                currentRoundTripTimeMs: 128,
                directBlockedReason: 'turn-candidate',
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        expect(await screen.findByText('安全中转')).toBeInTheDocument()
        expect(screen.getByText('128ms')).toBeInTheDocument()
        expect(screen.queryByText('网络只能选到中转候选')).not.toBeInTheDocument()
        expect(screen.getByLabelText('安全中转，128ms')).toBeInTheDocument()
    })

    it('keeps relay probe state out of the user-facing badge', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'relay',
                transportMode: 'relay-wss',
                currentRoundTripTimeMs: null,
                directProbe: 'probing',
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        expect(await screen.findByText('安全中转')).toBeInTheDocument()
        expect(screen.getByText('测速中')).toBeInTheDocument()
        expect(screen.queryByText('正在确认点对点心跳')).not.toBeInTheDocument()
    })

    it('keeps recent RPC latency out of the user-facing badge', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'direct',
                currentRoundTripTimeMs: 22,
                lastRpc: {
                    method: 'session.open',
                    route: 'direct',
                    durationMs: 1800,
                    ok: true,
                    timedOut: false,
                    requestBytes: 120,
                    requestChunks: 1,
                    responseBytes: 240 * 1024,
                    responseChunks: 15,
                    sampledAt: Date.now(),
                },
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        expect(await screen.findByText('点对点直连')).toBeInTheDocument()
        expect(screen.getByText('22ms')).toBeInTheDocument()
        expect(screen.queryByText('最近 打开会话 1.8s / 240KB')).not.toBeInTheDocument()
    })

    it('uses troubled RPC samples only for badge tone', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'relay',
                transportMode: 'relay-wss',
                currentRoundTripTimeMs: 80,
                directBlockedReason: 'turn-candidate',
                lastRpc: {
                    method: 'session.messages',
                    route: 'relay',
                    durationMs: 2600,
                    ok: true,
                    timedOut: false,
                    requestBytes: 120,
                    requestChunks: 1,
                    responseBytes: 80 * 1024,
                    responseChunks: 1,
                    sampledAt: Date.now(),
                },
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        const badge = (await screen.findByText('安全中转')).closest('.remote-pairing-link-badge')
        expect(badge).toHaveClass('is-warning')
        expect(screen.getByText('80ms')).toBeInTheDocument()
        expect(screen.queryByText('最近 加载消息 2.6s / 80KB')).not.toBeInTheDocument()
        expect(screen.queryByText('网络只能选到中转候选')).not.toBeInTheDocument()
    })

    it('marks a recent RPC timeout as danger without rendering diagnostics', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'direct',
                currentRoundTripTimeMs: 22,
                lastRpc: {
                    method: 'sessions.list',
                    route: 'direct',
                    durationMs: 30_000,
                    ok: false,
                    timedOut: true,
                    requestBytes: 80,
                    requestChunks: 1,
                    responseBytes: null,
                    responseChunks: null,
                    sampledAt: Date.now(),
                },
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        const badge = (await screen.findByText('点对点直连')).closest('.remote-pairing-link-badge')
        expect(badge).toHaveClass('is-danger')
        expect(screen.getByText('22ms')).toBeInTheDocument()
        expect(screen.queryByText('最近 同步列表 超时')).not.toBeInTheDocument()
    })

    it('shows the controller-owned reconnect state instead of stale link stats', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'relay',
                transportMode: 'relay-wss',
                currentRoundTripTimeMs: 128,
                sampledAt: Date.now(),
            })
        )

        render(
            <RemotePairingLinkBadge
                bridge={bridge}
                override={{ label: '正在接回', latency: '已重试 3 次', tone: 'danger' }}
            />
        )

        expect(await screen.findByText('正在接回')).toBeInTheDocument()
        expect(screen.getByText('已重试 3 次')).toBeInTheDocument()
        expect(screen.queryByText('安全中转')).not.toBeInTheDocument()
    })
})
