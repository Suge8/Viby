/**
 * Serialised, monotonic pairing presence reporter.
 *
 * Two reasons:
 *
 * 1. Network ordering: two independent `POST /pairing-presence` requests
 *    racing (e.g. bridge open immediately followed by stale close) can arrive
 *    at hub out-of-order, leaving in-memory presence in the wrong state.
 *    A serial promise chain plus a generation counter that skips stale
 *    intents guarantees the last intent wins and earlier ones are dropped.
 *
 * 2. Hub restart: hub sidecar restart wipes in-memory `DevicePresenceTracker`
 *    while the bridge data channel is still open. A low-frequency keepalive
 *    re-emits the latest `alive=true` so presence converges back without
 *    waiting for a bridge churn.
 */

import type { LocalHubPairingClient } from './localHubPairingClient'

const PRESENCE_KEEPALIVE_INTERVAL_MS = 30_000
const PRESENCE_RETRY_DELAY_MS = 2_000

export type PairingPresenceMeta = { deviceName?: string; platform?: string }

export interface PairingPresenceReporter {
    set(alive: boolean, meta?: PairingPresenceMeta): void
    dispose(): void
}

export function createPairingPresenceReporter(options: {
    client: LocalHubPairingClient
    pairingId: string
    onError: (message: string, error: unknown) => void
    keepaliveMs?: number
    retryDelayMs?: number
}): PairingPresenceReporter {
    let chain: Promise<void> = Promise.resolve()
    let generation = 0
    let lastAlive: boolean | null = null
    let lastMeta: PairingPresenceMeta | undefined
    let keepaliveTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false
    const keepaliveMs = options.keepaliveMs ?? PRESENCE_KEEPALIVE_INTERVAL_MS
    const retryDelayMs = options.retryDelayMs ?? PRESENCE_RETRY_DELAY_MS

    function clearRetry(): void {
        if (retryTimer === null) return
        clearTimeout(retryTimer)
        retryTimer = null
    }

    function startKeepalive(): void {
        if (keepaliveTimer !== null) return
        keepaliveTimer = setInterval(() => {
            if (lastAlive === true) enqueue(true, lastMeta, generation)
        }, keepaliveMs)
    }

    function stopKeepalive(): void {
        if (keepaliveTimer === null) return
        clearInterval(keepaliveTimer)
        keepaliveTimer = null
    }

    function enqueue(alive: boolean, meta: PairingPresenceMeta | undefined, intentGeneration: number): void {
        chain = chain.then(async () => {
            if (disposed) return
            // Skip any intent that has already been superseded by a newer one.
            if (intentGeneration !== generation) return
            try {
                await options.client.reportPairingPresence(options.pairingId, alive, meta)
            } catch (error) {
                if (disposed || intentGeneration !== generation) return
                // Schedule a retry of whatever the current target state is.
                clearRetry()
                retryTimer = setTimeout(() => {
                    retryTimer = null
                    if (disposed || lastAlive === null) return
                    enqueue(lastAlive, lastMeta, generation)
                }, retryDelayMs)
                options.onError(alive ? '设备上线同步失败，正在重试：' : '设备下线同步失败，正在重试：', error)
            }
        })
    }

    function set(alive: boolean, meta?: PairingPresenceMeta): void {
        if (disposed) return
        generation += 1
        lastAlive = alive
        lastMeta = meta
        clearRetry()
        if (alive) startKeepalive()
        else stopKeepalive()
        enqueue(alive, meta, generation)
    }

    function dispose(): void {
        if (disposed) return
        const wasAlive = lastAlive === true
        const finalMeta = lastMeta
        disposed = true
        stopKeepalive()
        clearRetry()
        // Chain the final alive=false behind any in-flight intent so the
        // teardown POST cannot reorder ahead of an earlier alive=true that is
        // still racing through the network. Earlier queued intents will
        // observe `disposed=true` on their turn and short-circuit, so the
        // last POST emitted is always the teardown.
        lastAlive = false
        if (wasAlive) {
            chain = chain.then(async () => {
                try {
                    await options.client.reportPairingPresence(options.pairingId, false, finalMeta)
                } catch {
                    // Best-effort: keepalive and retry are gone, hub will
                    // eventually converge on the next bridge open.
                }
            })
        }
    }

    return { set, dispose }
}
