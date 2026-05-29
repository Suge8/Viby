import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRemoteDirectHeartbeat } from './remotePairingDirectHeartbeat'

function openChannel(send: (payload: string) => void): RTCDataChannel {
    return { readyState: 'open', send } as RTCDataChannel
}

describe('createRemoteDirectHeartbeat', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns RTT from the acknowledged direct heartbeat', () => {
        vi.useFakeTimers()
        vi.setSystemTime(1_000)
        const sent: string[] = []
        const channel = openChannel((payload) => sent.push(payload))
        const heartbeat = createRemoteDirectHeartbeat({
            getChannel: () => channel,
            onFailure: vi.fn(),
        })

        heartbeat.start(channel)
        const payload = JSON.parse(sent[0] ?? '{}')
        vi.setSystemTime(1_024)

        expect(payload).toMatchObject({ kind: 'heartbeat', sentAt: 1_000 })
        expect(heartbeat.markAck(channel, { ...payload, ack: true })).toBe(24)
        expect(heartbeat.markAck(channel, { ...payload, ack: true })).toBeNull()

        heartbeat.stop()
    })

    it('can send an immediate follow-up probe after an ACK', () => {
        vi.useFakeTimers()
        vi.setSystemTime(2_000)
        const sent: string[] = []
        const channel = openChannel((payload) => sent.push(payload))
        const heartbeat = createRemoteDirectHeartbeat({
            getChannel: () => channel,
            onFailure: vi.fn(),
        })

        heartbeat.start(channel)
        const first = JSON.parse(sent[0] ?? '{}')
        vi.setSystemTime(2_012)
        expect(heartbeat.markAck(channel, { ...first, ack: true })).toBe(12)

        vi.setSystemTime(2_013)
        heartbeat.notifyForeground()
        const second = JSON.parse(sent[1] ?? '{}')

        expect(second).toMatchObject({ kind: 'heartbeat', sentAt: 2_013 })
        heartbeat.stop()
    })
})
