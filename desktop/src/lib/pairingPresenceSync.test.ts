import { describe, expect, it, mock } from 'bun:test'
import { createPairingPresenceReporter, type PairingPresenceMeta } from './pairingPresenceSync'

type Intent = { alive: boolean; meta?: PairingPresenceMeta }

function buildClient(behavior?: { fail?: (intent: Intent, attempt: number) => boolean }) {
    const calls: Intent[] = []
    let attempt = 0
    const reportPairingPresence = mock(async (_pairingId: string, alive: boolean, meta?: PairingPresenceMeta) => {
        attempt += 1
        const intent: Intent = { alive, meta }
        calls.push(intent)
        if (behavior?.fail?.(intent, attempt)) {
            throw new Error('simulated failure')
        }
    })
    return { client: { reportPairingPresence } as never, calls }
}

async function flushChain(): Promise<void> {
    // The reporter chains async tasks via `Promise.resolve().then(...)`; a few
    // microtask cycles flush every pending task in our deterministic tests.
    for (let i = 0; i < 5; i += 1) {
        await Promise.resolve()
    }
}

describe('createPairingPresenceReporter', () => {
    it('emits the latest declared intent and skips superseded ones (last-writer-wins)', async () => {
        const { client, calls } = buildClient()
        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError: () => undefined,
        })

        // Two synchronous toggles before any HTTP round-trip resolves: only
        // the final intent should hit the network so out-of-order delivery
        // can never leave hub stuck on a stale value.
        reporter.set(true)
        reporter.set(false)

        await flushChain()
        expect(calls.length).toBe(1)
        expect(calls[0].alive).toBe(false)
        reporter.dispose()
    })

    it('after a delivered intent settles, subsequent intents still emit', async () => {
        const { client, calls } = buildClient()
        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError: () => undefined,
        })

        reporter.set(true)
        await flushChain()
        reporter.set(false)
        await flushChain()
        reporter.set(true)
        await flushChain()

        expect(calls.map((call) => call.alive)).toEqual([true, false, true])
        reporter.dispose()
    })

    it('retries the latest target after a network failure', async () => {
        const { client, calls } = buildClient({ fail: (_, attempt) => attempt === 1 })
        const onError = mock((_message: string, _error: unknown) => undefined)
        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError,
            retryDelayMs: 5,
        })

        reporter.set(true)
        await flushChain()
        // First attempt fails, scheduling a retry.
        await new Promise((resolve) => setTimeout(resolve, 20))
        await flushChain()
        expect(calls.length).toBeGreaterThanOrEqual(2)
        expect(calls[calls.length - 1].alive).toBe(true)
        expect(onError).toHaveBeenCalled()
        reporter.dispose()
    })

    it('keeps presence warm via periodic alive=true keepalive', async () => {
        const { client, calls } = buildClient()
        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError: () => undefined,
            keepaliveMs: 5,
        })

        reporter.set(true)
        await flushChain()
        await new Promise((resolve) => setTimeout(resolve, 15))
        await flushChain()
        expect(calls.length).toBeGreaterThanOrEqual(2)
        expect(calls.every((call) => call.alive === true)).toBe(true)
        reporter.dispose()
    })

    it('stops keepalive after dispose and emits a final alive=false', async () => {
        const { client, calls } = buildClient()
        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError: () => undefined,
            keepaliveMs: 5,
        })

        reporter.set(true)
        await flushChain()
        reporter.dispose()
        await flushChain()
        const sinceDispose = calls.length
        await new Promise((resolve) => setTimeout(resolve, 15))
        await flushChain()
        expect(calls.length).toBe(sinceDispose)
        expect(calls[calls.length - 1].alive).toBe(false)
    })

    it('chains the final alive=false behind a still-resolving alive=true so ordering survives network races', async () => {
        let resolveFirst: (() => void) | undefined
        const calls: Intent[] = []
        const client = {
            reportPairingPresence: mock(async (_pairingId: string, alive: boolean, meta?: PairingPresenceMeta) => {
                calls.push({ alive, meta })
                if (alive) await new Promise<void>((resolve) => (resolveFirst = resolve))
            }),
        } as never

        const reporter = createPairingPresenceReporter({
            client,
            pairingId: 'pairing-1',
            onError: () => undefined,
        })

        reporter.set(true)
        await flushChain()
        // dispose while the first POST is still resolving
        reporter.dispose()
        await flushChain()
        // teardown is queued but blocked on the in-flight alive=true
        expect(calls.map((call) => call.alive)).toEqual([true])
        resolveFirst?.()
        await flushChain()
        await flushChain()
        expect(calls.map((call) => call.alive)).toEqual([true, false])
    })
})
