import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemotePairingLinkBadge } from './RemotePairingLinkBadge'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import type { RemotePeerTransportStats } from './remotePairingStats'

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
                transportMode: 'turn-webrtc',
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

    it('exposes the reason when direct cannot promote', async () => {
        const bridge = bridgeWithStats(
            transportStats({
                transport: 'relay',
                transportMode: 'turn-webrtc',
                currentRoundTripTimeMs: 128,
                directBlockedReason: 'turn-candidate',
            })
        )

        render(<RemotePairingLinkBadge bridge={bridge} />)

        expect(await screen.findByLabelText('安全中转，128ms，网络只能选到 TURN 中转')).toBeInTheDocument()
    })
})
