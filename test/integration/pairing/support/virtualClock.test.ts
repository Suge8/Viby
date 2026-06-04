import { describe, expect, it } from 'bun:test'
import { createVirtualClock } from './virtualClock'

describe('VirtualClock', () => {
    it('fires due timers in (time, insertion) order and stops at the target', async () => {
        const clock = createVirtualClock()
        const order: string[] = []
        clock.setTimeout(() => order.push('b@10'), 10)
        clock.setTimeout(() => order.push('a@5'), 5)
        clock.setTimeout(() => order.push('c@10'), 10)
        await clock.advance(10)
        expect(order).toEqual(['a@5', 'b@10', 'c@10'])
        expect(clock.now()).toBe(10)
        expect(clock.pendingTimerCount()).toBe(0)
    })

    it('produces reproducible jitter for a given seed', () => {
        const left = createVirtualClock(7)
        const right = createVirtualClock(7)
        const leftSeq = [left.random(), left.random(), left.random()]
        const rightSeq = [right.random(), right.random(), right.random()]
        expect(leftSeq).toEqual(rightSeq)
        expect(leftSeq.every((value) => value >= 0 && value < 1)).toBe(true)
    })

    it('de-correlates distinct seeds (the herd-avoidance precondition)', () => {
        const peerA = createVirtualClock(1)
        const peerB = createVirtualClock(2)
        expect(peerA.random()).not.toBe(peerB.random())
    })

    it('repeats interval timers and honours cancellation', async () => {
        const clock = createVirtualClock()
        let ticks = 0
        const cancel = clock.setInterval(() => {
            ticks += 1
        }, 10)
        await clock.advance(35)
        expect(ticks).toBe(3)
        cancel()
        await clock.advance(100)
        expect(ticks).toBe(3)
        expect(clock.pendingTimerCount()).toBe(0)
    })

    it('drains microtasks after each timer so chained awaits resolve in order', async () => {
        const clock = createVirtualClock()
        const order: string[] = []
        clock.setTimeout(() => {
            order.push('timer')
            void Promise.resolve().then(() => order.push('microtask'))
        }, 5)
        await clock.advance(5)
        expect(order).toEqual(['timer', 'microtask'])
    })

    it('fires a timer scheduled by another timer within the same advance', async () => {
        const clock = createVirtualClock()
        const order: string[] = []
        clock.setTimeout(() => {
            order.push('first')
            clock.setTimeout(() => order.push('second'), 5)
        }, 5)
        await clock.advance(10)
        expect(order).toEqual(['first', 'second'])
        expect(clock.now()).toBe(10)
    })
})
