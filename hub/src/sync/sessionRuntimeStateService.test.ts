import { describe, expect, it } from 'bun:test'
import { SessionRuntimeStateService } from './sessionRuntimeStateService'

describe('SessionRuntimeStateService', () => {
    it('resolves waiters when stopping clears', async () => {
        const service = new SessionRuntimeStateService()
        service.markStopping('session-1', 'idle-timeout')
        expect(service.getStoppingReason('session-1')).toBe('idle-timeout')

        const wait = service.waitUntilNotStopping('session-1', 1_000)
        service.clear('session-1')

        expect(await wait).toBe(true)
    })

    it('times out while runtime is still stopping', async () => {
        const service = new SessionRuntimeStateService()
        service.markStopping('session-1')

        expect(await service.waitUntilNotStopping('session-1', 1)).toBe(false)
        expect(service.isStopping('session-1')).toBe(true)
    })
})
