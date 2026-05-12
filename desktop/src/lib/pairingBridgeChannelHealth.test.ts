import { describe, expect, it, mock } from 'bun:test'
import { createPairingBridgeChannelHealth } from './pairingBridgeChannelHealth'

describe('pairingBridgeChannelHealth', () => {
    it('waits for guest traffic before marking an open channel healthy', async () => {
        const onStale = mock(() => undefined)
        const health = createPairingBridgeChannelHealth({ onStale, staleMs: 1 })

        health.start()
        expect(health.isHealthy()).toBe(false)
        await new Promise((resolve) => setTimeout(resolve, 2))

        expect(health.isHealthy()).toBe(false)
        expect(onStale).toHaveBeenCalledTimes(1)
    })

    it('keeps the channel healthy when inbound frames arrive', () => {
        const onStale = mock(() => undefined)
        const health = createPairingBridgeChannelHealth({ onStale, staleMs: 1 })

        health.start()
        expect(health.noteInbound()).toBe(true)
        expect(health.noteInbound()).toBe(false)
        health.stop()

        expect(health.isHealthy()).toBe(false)
        expect(onStale).not.toHaveBeenCalled()
    })
})
