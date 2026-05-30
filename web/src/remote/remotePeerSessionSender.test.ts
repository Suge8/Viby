import { createPairingTunnelRouteState, type PairingPeerTextSender } from '@viby/protocol/pairing'
import { describe, expect, it, vi } from 'vitest'
import type { RemotePairingRelaySocket } from './remotePairingRelaySocket'
import { createRemotePeerSessionSender } from './remotePeerSessionSender'

function readyRouteState(activeRoute: 'direct' | 'relay') {
    return { ...createPairingTunnelRouteState(), phase: 'ready' as const, activeRoute }
}

function relaySocket() {
    return { readyState: 'open', send: vi.fn() } as unknown as RemotePairingRelaySocket
}

describe('createRemotePeerSessionSender', () => {
    it('uses direct text sender only after the direct route is active and ready', async () => {
        const directTextSender = {
            send: vi.fn(async () => ({ bytes: 1, chunks: 1 })),
        } as unknown as PairingPeerTextSender
        const sender = createRemotePeerSessionSender({
            routeState: readyRouteState('direct'),
            directChannelReady: true,
            channel: { readyState: 'open' } as RTCDataChannel,
            directTextSender,
            relay: relaySocket(),
        })

        await sender?.sendText('x', 'interactive')

        expect(sender?.route).toBe('direct')
        expect(directTextSender.send).toHaveBeenCalledWith('x', expect.objectContaining({ priority: 'interactive' }))
    })

    it('falls back to relay while direct is not ready', async () => {
        const relay = relaySocket()
        const sender = createRemotePeerSessionSender({
            routeState: readyRouteState('relay'),
            directChannelReady: false,
            channel: { readyState: 'open' } as RTCDataChannel,
            directTextSender: null,
            relay,
        })

        await sender?.sendText('x', 'interactive')

        expect(sender?.route).toBe('relay')
        expect(relay.send).toHaveBeenCalledWith('x')
    })

    it('does not send RPC while foreground validation is pending', () => {
        const sender = createRemotePeerSessionSender({
            routeState: { ...readyRouteState('relay'), phase: 'reconnecting', activeRoute: null },
            directChannelReady: false,
            channel: null,
            directTextSender: null,
            relay: relaySocket(),
        })

        expect(sender).toBeNull()
    })
})
