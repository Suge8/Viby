import type { RelaySocket } from '../../../../desktop/src/lib/pairingRelayBridgeRuntime'
import { MemoryPairingStore } from '../../../../pairing/src/memoryStore'
import { PairingSocketHub } from '../../../../pairing/src/ws'
import { PairingBrokerTunnelMessageSchema, type PairingSessionRecord } from '../../../../shared/src/pairing'
import { createDuplexPair, type InMemoryDuplexEndpoint } from './inMemoryDuplex'
import type { VirtualClock } from './virtualClock'

/**
 * Boots the REAL pairing broker tunnel hub (`PairingSocketHub` +
 * `MemoryPairingStore`) over an in-memory duplex transport on a virtual clock,
 * and hands out a `socketFactory` the real desktop relay bridge / web relay
 * socket can use. Every frame crosses the real broker: real token lookup, real
 * `attach` rejection (1008 invalid_token / 1000 pairing_unavailable), real
 * host↔guest forwarding. Nothing about the credential lifecycle is faked.
 *
 * This is the harness that makes the "stale persisted pairing starves a fresh
 * scan" failure (D11) reproducible in the default `bun:test` loop.
 */
export interface BrokerTunnelHarness {
    readonly hub: PairingSocketHub
    readonly store: MemoryPairingStore
    /** Bridge-side sockets opened so far, keyed by tunnel URL, for churn assertions. */
    readonly bridgeSockets: InMemoryDuplexEndpoint[]
    socketFactory(url: string): RelaySocket
    seedSession(session: Partial<PairingSessionRecord> & { id: string; hostTokenHash: string }): void
    tunnelUrlFor(pairingId: string, tokenHash: string): string
}

function tunnelUrl(pairingId: string, tokenHash: string): string {
    return `wss://broker.test/pairings/${pairingId}/tunnel?token=${tokenHash}`
}

function parseTunnelUrl(url: string): { pairingId: string; tokenHash: string } {
    const parsed = new URL(url)
    const pairingId = parsed.pathname.split('/')[2] ?? ''
    return { pairingId, tokenHash: parsed.searchParams.get('token') ?? '' }
}

export function brokerTunnelUrl(pairingId: string, tokenHash: string): string {
    return tunnelUrl(pairingId, tokenHash)
}

export function bootBrokerTunnel(clock: VirtualClock): BrokerTunnelHarness {
    const store = new MemoryPairingStore(clock.now)
    const hub = new PairingSocketHub({
        store,
        now: clock.now,
        scheduleTimeout: clock.setTimeout,
        messageSchema: PairingBrokerTunnelMessageSchema,
    })
    const bridgeSockets: InMemoryDuplexEndpoint[] = []

    function socketFactory(url: string): RelaySocket {
        const { pairingId, tokenHash } = parseTunnelUrl(url)
        const [brokerSide, bridgeSide] = createDuplexPair(clock, { leftLabel: 'broker', rightLabel: 'bridge' })
        bridgeSockets.push(bridgeSide)
        // A real WebSocket connects asynchronously; defer attach to the clock so
        // the bridge has installed its onopen/onclose handlers first.
        clock.setTimeout(() => void attach(pairingId, tokenHash, brokerSide, bridgeSide), 0)
        return bridgeSide as unknown as RelaySocket
    }

    async function attach(
        pairingId: string,
        tokenHash: string,
        brokerSide: InMemoryDuplexEndpoint,
        bridgeSide: InMemoryDuplexEndpoint
    ): Promise<void> {
        brokerSide.open()
        brokerSide.onmessage = (event) => void hub.handleMessage(brokerSide, String(event.data))
        brokerSide.onclose = () => void hub.detach(brokerSide)
        // The broker rejects an invalid/stale token or a deleted/expired pairing
        // inside attach() by closing brokerSide with the fatal code; that close
        // propagates to bridgeSide.onclose so the bridge can go terminal.
        const connection = await hub.attach(pairingId, tokenHash, brokerSide)
        if (!connection) return
        bridgeSide.open()
    }

    function seedSession(session: Partial<PairingSessionRecord> & { id: string; hostTokenHash: string }): void {
        const now = clock.now()
        void store.createSession({
            id: session.id,
            state: session.state ?? 'active',
            shortCode: session.shortCode ?? '123456',
            approvalStatus: session.approvalStatus ?? 'approved',
            host: { tokenHash: session.hostTokenHash },
            authorizedDevice: session.authorizedDevice ?? null,
            createdAt: session.createdAt ?? now,
            updatedAt: session.updatedAt ?? now,
            expiresAt: session.expiresAt ?? now + 60 * 60 * 1000,
        })
    }

    return { hub, store, bridgeSockets, socketFactory, seedSession, tunnelUrlFor: tunnelUrl }
}
