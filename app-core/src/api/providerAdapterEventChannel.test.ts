import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderAdapterEventChannel } from './providerAdapterEventChannel'

function stubStdout(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

describe('ProviderAdapterEventChannel', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('rejects metadata requests when Hub ack does not arrive', async () => {
        stubStdout()
        const channel = new ProviderAdapterEventChannel('session-1', 10)
        const request = channel.request('update-metadata', {
            expectedVersion: 1,
            metadata: { path: '/repo', host: 'desk' },
        })

        vi.advanceTimersByTime(10)

        await expect(request).rejects.toThrow('Runtime update-metadata ack timed out: session-1')
    })

    it('preserves version-mismatch acknowledgements instead of reporting success', async () => {
        const write = stubStdout()
        const channel = new ProviderAdapterEventChannel('session-1', 100)
        const request = channel.request('update-metadata', {
            expectedVersion: 1,
            metadata: { path: '/repo', host: 'desk' },
        })
        const raw = String(write.mock.calls[0]?.[0] ?? '')
        const requestId = JSON.parse(raw).requestId as string

        channel.resolveAck({
            type: 'runtime.metadata-result',
            requestId,
            result: 'version-mismatch',
            version: 2,
            value: { path: '/repo', host: 'desk' },
        })

        await expect(request).resolves.toEqual({
            result: 'version-mismatch',
            version: 2,
            metadata: { path: '/repo', host: 'desk' },
        })
    })

    it('rejects pending requests when the channel disconnects', async () => {
        stubStdout()
        const channel = new ProviderAdapterEventChannel('session-1', 100)
        const request = channel.request('update-state', { expectedVersion: 1, agentState: { controlledByUser: true } })

        channel.disconnect()

        await expect(request).rejects.toThrow('Runtime event channel disconnected: session-1')
    })
})
