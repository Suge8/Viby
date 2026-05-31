import type { PairingPeerRequest } from '@viby/protocol'
import { createPairingTunnelRouteState, reducePairingTunnelRoute } from '@viby/protocol/pairing'
import { describe, expect, it, vi } from 'vitest'
import { requestRemotePeer, shouldRetryRemotePeerRequestViaRelay } from './remotePeerSessionRequest'

function request(method: PairingPeerRequest['method']): PairingPeerRequest {
    return { kind: 'request', id: 'request-1', method } as PairingPeerRequest
}

function readyDirectRoute() {
    let state = createPairingTunnelRouteState()
    state = reducePairingTunnelRoute(state, {
        type: 'heartbeat-ack',
        route: 'relay',
        roundTripTimeMs: 20,
        sampledAt: 1,
    })
    state = reducePairingTunnelRoute(state, {
        type: 'direct-candidate-selected',
        candidateType: 'host',
        roundTripTimeMs: 5,
        sampledAt: 2,
    })
    state = reducePairingTunnelRoute(state, {
        type: 'heartbeat-ack',
        route: 'direct',
        roundTripTimeMs: 5,
        sampledAt: 3,
    })
    return reducePairingTunnelRoute(state, { type: 'heartbeat-ack', route: 'direct', roundTripTimeMs: 5, sampledAt: 4 })
}

describe('remotePeerSessionRequest', () => {
    it('retries idempotent lifecycle RPCs through relay after direct failure', async () => {
        const routes: string[] = []
        const pendingRequests = {
            async request<T>(sender: { route: 'direct' | 'relay' } | null): Promise<T> {
                if (!sender) throw new Error('missing sender')
                routes.push(sender.route)
                if (sender.route === 'direct') throw new Error('direct timeout')
                return { ok: true } as T
            },
        }

        await expect(
            requestRemotePeer(
                {
                    pendingRequests,
                    routeState: readyDirectRoute(),
                    directChannelReady: true,
                    channel: { readyState: 'open' } as RTCDataChannel,
                    directTextSender: { send: vi.fn() } as never,
                    relay: { readyState: 'open', send: vi.fn() } as never,
                    getFatalError: () => null,
                },
                request('session.close'),
                (value) => value
            )
        ).resolves.toEqual({ ok: true })

        expect(routes).toEqual(['direct', 'relay'])
    })

    it('does not retry non-idempotent send RPCs', () => {
        expect(shouldRetryRemotePeerRequestViaRelay('session.close')).toBe(true)
        expect(shouldRetryRemotePeerRequestViaRelay('session.send')).toBe(false)
    })
})
