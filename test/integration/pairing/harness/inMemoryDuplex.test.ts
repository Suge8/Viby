import { describe, expect, it } from 'bun:test'
import { createBlackholeFault, duplicateEvery, fixedDelay } from './faults'
import { createDuplexPair, DUPLEX_CLOSED, DUPLEX_OPEN } from './inMemoryDuplex'
import { createVirtualClock } from './virtualClock'

describe('InMemoryDuplex', () => {
    it('delivers string frames over the virtual clock without bypassing serialization', async () => {
        const clock = createVirtualClock()
        const [left, right] = createDuplexPair(clock)
        const delivered: string[] = []
        right.onmessage = (event) => delivered.push(event.data)
        left.open()
        right.open()
        left.send(JSON.stringify({ type: 'ping', seq: 1 }))
        expect(delivered).toEqual([])
        await clock.advance(0)
        expect(delivered).toEqual(['{"type":"ping","seq":1}'])
        expect(left.sent).toEqual(['{"type":"ping","seq":1}'])
        expect(right.delivered).toEqual(['{"type":"ping","seq":1}'])
    })

    it('models an iOS-style suspended socket that stays open and fires no close', async () => {
        const clock = createVirtualClock()
        const [left, right] = createDuplexPair(clock)
        let closeCount = 0
        const delivered: string[] = []
        left.onclose = () => {
            closeCount += 1
        }
        right.onmessage = (event) => delivered.push(event.data)
        left.open()
        right.open()
        left.suspend()
        left.send('stale-open-frame')
        await clock.advance(0)
        expect(left.readyState).toBe(DUPLEX_OPEN)
        expect(closeCount).toBe(0)
        expect(delivered).toEqual([])
    })

    it('applies deterministic delay and duplication faults', async () => {
        const clock = createVirtualClock()
        const [left, right] = createDuplexPair(clock, { fault: { ...fixedDelay(10), ...duplicateEvery(1) } })
        const delivered: string[] = []
        right.onmessage = (event) => delivered.push(event.data)
        left.open()
        right.open()
        left.send('payload')
        await clock.advance(9)
        expect(delivered).toEqual([])
        await clock.advance(1)
        expect(delivered).toEqual(['payload', 'payload'])
    })

    it('can blackhole frames without closing either endpoint', async () => {
        const clock = createVirtualClock()
        const [left, right] = createDuplexPair(clock, { fault: createBlackholeFault() })
        const delivered: string[] = []
        right.onmessage = (event) => delivered.push(event.data)
        left.open()
        right.open()
        left.send('lost')
        await clock.advance(0)
        expect(delivered).toEqual([])
        expect(left.readyState).toBe(DUPLEX_OPEN)
        expect(right.readyState).toBe(DUPLEX_OPEN)
    })

    it('closes both sides when one endpoint closes', () => {
        const clock = createVirtualClock()
        const [left, right] = createDuplexPair(clock)
        let leftClosed = 0
        let rightClosed = 0
        left.onclose = () => {
            leftClosed += 1
        }
        right.onclose = () => {
            rightClosed += 1
        }
        left.open()
        right.open()
        left.close()
        expect(left.readyState).toBe(DUPLEX_CLOSED)
        expect(right.readyState).toBe(DUPLEX_CLOSED)
        expect(leftClosed).toBe(1)
        expect(rightClosed).toBe(1)
    })
})
