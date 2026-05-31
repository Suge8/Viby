import { describe, expect, it } from 'bun:test'
import { startPairingRelayBridge } from '../../../desktop/src/lib/pairingRelayBridge'
import type { RelaySocket } from '../../../desktop/src/lib/pairingRelayBridgeRuntime'
import { bootBrokerTunnel } from './harness/bootBrokerTunnel'
import { DUPLEX_OPEN } from './harness/inMemoryDuplex'
import { createVirtualClock } from './harness/virtualClock'

/**
 * D11 — real persisted desktop state pollution.
 *
 * The QR-scan hang ("把电脑牵回来") was a stale host token whose relay bridge
 * reconnect-stormed forever against a broker that permanently rejected it,
 * starving a freshly scanned pairing on the same origin. This drives the REAL
 * broker (`PairingSocketHub` + `MemoryPairingStore`) and the REAL desktop relay
 * bridge over an in-memory duplex on a virtual clock: stale tokens must go
 * terminal without churn, and a valid pairing must connect regardless.
 *
 * Without the fix (handleClose unconditionally reconnecting) the stale bridges
 * re-open a new socket on every backoff tick — `socketCalls` would climb past 1
 * and `onFatal` would never fire — so this test fails loudly on a regression.
 */

interface BridgeProbe {
    socketCalls: number
    fatalReasons: string[]
    asyncErrors: string[]
    ready: boolean
    isReady(): boolean
}

function startProbedBridge(options: {
    clock: ReturnType<typeof createVirtualClock>
    tunnelUrl: string
    factory: (url: string) => RelaySocket
}): BridgeProbe {
    const probe: BridgeProbe = {
        socketCalls: 0,
        fatalReasons: [],
        asyncErrors: [],
        ready: false,
        isReady: () => false,
    }
    const handle = startPairingRelayBridge({
        tunnelUrl: options.tunnelUrl,
        getClient: () => ({ streamEvents: async () => {} }) as never,
        isDisposed: () => false,
        onActive: () => {},
        onClosed: () => {
            probe.ready = false
        },
        onOpen: () => {
            probe.ready = true
        },
        onFatal: (reason) => probe.fatalReasons.push(reason),
        reportAsyncError: (message) => probe.asyncErrors.push(message),
        now: options.clock.now,
        randomJitter: options.clock.random,
        scheduleInterval: options.clock.setInterval,
        scheduleTimeout: options.clock.setTimeout,
        socketFactory: (url) => {
            probe.socketCalls += 1
            return options.factory(url)
        },
    })
    probe.isReady = handle.isReady
    return probe
}

describe('pairing stale-startup churn (D11)', () => {
    it('terminates stale host tokens without churn while a valid pairing connects', async () => {
        const clock = createVirtualClock(7)
        const broker = bootBrokerTunnel(clock)
        broker.seedSession({ id: 'valid', hostTokenHash: 'valid-host' })
        broker.seedSession({ id: 'doomed', hostTokenHash: 'doomed-host' })
        await broker.store.deleteSession('doomed', clock.now())

        const staleUnknownA = startProbedBridge({
            clock,
            tunnelUrl: broker.tunnelUrlFor('ghost-a', 'ghost-host-a'),
            factory: broker.socketFactory,
        })
        const staleUnknownB = startProbedBridge({
            clock,
            tunnelUrl: broker.tunnelUrlFor('ghost-b', 'ghost-host-b'),
            factory: broker.socketFactory,
        })
        // A deleted session has its host token purged from the broker index,
        // so it is rejected exactly like an unknown token (1008). Either fatal
        // code must terminate the bridge — the cross-end contract for the 1000
        // `pairing_unavailable` reason is locked in pairingCloseCode.test.ts.
        const staleDeleted = startProbedBridge({
            clock,
            tunnelUrl: broker.tunnelUrlFor('doomed', 'doomed-host'),
            factory: broker.socketFactory,
        })
        const fresh = startProbedBridge({
            clock,
            tunnelUrl: broker.tunnelUrlFor('valid', 'valid-host'),
            factory: broker.socketFactory,
        })

        // Drive well past many reconnect-backoff windows. A churning bridge
        // would open dozens of sockets in this span.
        await clock.advance(60_000)

        // Unknown/invalid tokens are rejected 1008 and go terminal once.
        expect(staleUnknownA.fatalReasons).toEqual(['invalid_token'])
        expect(staleUnknownA.socketCalls).toBe(1)
        expect(staleUnknownB.fatalReasons).toEqual(['invalid_token'])
        expect(staleUnknownB.socketCalls).toBe(1)

        // Deleted pairing's token is purged from the index → rejected 1008 and
        // goes terminal once (no churn).
        expect(staleDeleted.fatalReasons).toEqual(['invalid_token'])
        expect(staleDeleted.socketCalls).toBe(1)

        // No stale rejection is misreported as a transport error.
        expect(staleUnknownA.asyncErrors).toEqual([])
        expect(staleDeleted.asyncErrors).toEqual([])

        // The fresh pairing is unaffected: attached to the broker, never fatal,
        // never churning, socket still open.
        expect(fresh.fatalReasons).toEqual([])
        expect(fresh.asyncErrors).toEqual([])
        expect(fresh.socketCalls).toBe(1)
        const freshBridgeSocket = broker.bridgeSockets.at(-1)
        expect(freshBridgeSocket?.readyState).toBe(DUPLEX_OPEN)
    })
})
