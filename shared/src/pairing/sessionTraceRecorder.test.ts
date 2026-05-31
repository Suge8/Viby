import { describe, expect, it } from 'bun:test'
import { SessionTraceBundleSchema } from './sessionTrace'
import { createSessionTraceRecorder, redactPayloadMeta } from './sessionTraceRecorder'

describe('session trace recorder', () => {
    it('records pairing-scoped events with monotonic sequence numbers', () => {
        let monotonicMs = 10
        let wallMs = 1_000
        const recorder = createSessionTraceRecorder({
            pairingId: 'pairing-1',
            peerRole: 'phone',
            monotonicNow: () => monotonicMs++,
            wallNow: () => wallMs++,
        })
        const seen: string[] = []
        recorder.subscribe((event) => seen.push(event.event))

        recorder.emit({ event: 'ws.open', payloadMeta: { route: 'relay' } })
        recorder.emit({ event: 'relay.reconnect', sessionId: 'session-1' })
        const bundle = recorder.export()

        expect(SessionTraceBundleSchema.parse(bundle)).toEqual(bundle)
        expect(bundle.events.map((event) => event.seq)).toEqual([0, 1])
        expect(bundle.events[0]).toMatchObject({
            pairingId: 'pairing-1',
            peerRole: 'phone',
            monotonicMs: 10,
            wallMs: 1_000,
            event: 'ws.open',
        })
        expect(seen).toEqual(['ws.open', 'relay.reconnect'])
    })

    it('redacts secrets and drops structured payloads at the recorder boundary', () => {
        expect(
            redactPayloadMeta({
                token: 'abc123',
                sdp: 'v=0\r\na=ice-ufrag:secret',
                ok: true,
                count: 2,
                nested: { unsafe: true },
                long: 'x'.repeat(80),
            })
        ).toEqual({
            token: '[redacted]',
            sdp: '[redacted]',
            ok: true,
            count: 2,
            long: `${'x'.repeat(64)}...`,
        })
    })

    it('retains only the configured event window', () => {
        const recorder = createSessionTraceRecorder({
            pairingId: 'pairing-1',
            peerRole: 'desktop',
            limit: 2,
            monotonicNow: () => 1,
            wallNow: () => 1,
        })

        recorder.emit({ event: 'ws.open' })
        recorder.emit({ event: 'heartbeat.ack' })
        recorder.emit({ event: 'ws.close' })

        expect(recorder.export().events.map((event) => event.event)).toEqual(['heartbeat.ack', 'ws.close'])
    })
})
