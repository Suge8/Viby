/**
 * Deterministic virtual clock for the pairing integration tier.
 *
 * Every timer, interval and jitter source in the harness is driven through this
 * clock so a full pairing lifecycle (grace windows, heartbeats, backoff,
 * reconnection storms) runs without wall-clock time and replays identically.
 *
 * It is the single dependency the DI seams (relay socket, relay bridge, broker
 * grace, hub sweep) are wired to — see docs/architecture/pairing-integration-tests.md.
 */

interface ScheduledTimer {
    at: number
    fire: () => void
    intervalMs?: number
    id: number
}

export interface VirtualClock {
    /** Current virtual time in ms (starts at 0). */
    now(): number
    /** Schedule a one-shot timer; returns a canceller. */
    setTimeout(fire: () => void, delayMs: number): () => void
    /** Schedule a repeating timer; returns a canceller. */
    setInterval(fire: () => void, periodMs: number): () => void
    /** Seeded PRNG in [0, 1); reproducible per seed, so two peers can be de-correlated by distinct seeds. */
    random(): number
    /** Advance virtual time by `ms`, firing due timers in (time, insertion) order and draining microtasks after each. */
    advance(ms: number): Promise<void>
    /** Flush pending microtasks without advancing time. */
    drain(): Promise<void>
    /** Number of timers still armed (lets tests assert no leaked timers). */
    pendingTimerCount(): number
}

const MICROTASK_FLUSHES = 8

export function createVirtualClock(seed = 1): VirtualClock {
    let current = 0
    let rngState = seed >>> 0
    let nextId = 0
    const timers: ScheduledTimer[] = []

    const cancel = (id: number): void => {
        const index = timers.findIndex((timer) => timer.id === id)
        if (index >= 0) timers.splice(index, 1)
    }

    const drain = async (): Promise<void> => {
        for (let flush = 0; flush < MICROTASK_FLUSHES; flush += 1) {
            await Promise.resolve()
        }
    }

    return {
        now: () => current,
        random: () => {
            rngState = (rngState * 1664525 + 1013904223) >>> 0
            return rngState / 0x100000000
        },
        setTimeout(fire, delayMs) {
            const id = nextId++
            timers.push({ at: current + Math.max(0, delayMs), fire, id })
            return () => cancel(id)
        },
        setInterval(fire, periodMs) {
            const id = nextId++
            const intervalMs = Math.max(1, periodMs)
            timers.push({ at: current + intervalMs, fire, intervalMs, id })
            return () => cancel(id)
        },
        async advance(ms) {
            const target = current + ms
            for (;;) {
                const next = timers
                    .filter((timer) => timer.at <= target)
                    .sort((left, right) => left.at - right.at || left.id - right.id)[0]
                if (!next) break
                current = next.at
                if (next.intervalMs !== undefined) next.at += next.intervalMs
                else cancel(next.id)
                next.fire()
                await drain()
            }
            current = target
        },
        drain,
        pendingTimerCount: () => timers.length,
    }
}
