import { afterEach, describe, expect, it } from 'vitest'
import { enterControllerSurface } from './controllerOwnershipProbe'

declare global {
    interface Window {
        __VIBY_CONTROLLER_TRACE__?: unknown[]
        __VIBY_CONTROLLER_ACTIVE__?: Record<string, Record<string, number>>
        __VIBY_ENABLE_CONTROLLER_TRACE_LOG__?: boolean
    }
}

describe('controllerOwnershipProbe', () => {
    afterEach(() => {
        window.__VIBY_CONTROLLER_TRACE__ = []
        window.__VIBY_CONTROLLER_ACTIVE__ = {}
        window.__VIBY_ENABLE_CONTROLLER_TRACE_LOG__ = false
    })

    it('records a conflict when two controllers hold the same surface at once', () => {
        const leaveA = enterControllerSurface('session-chat:test', 'runtime-surface')
        const leaveB = enterControllerSurface('session-chat:test', 'local-notices')
        leaveB()
        leaveA()

        const trace = window.__VIBY_CONTROLLER_TRACE__ ?? []
        const conflict = trace.find(
            (entry) => typeof entry === 'object' && entry !== null && (entry as { type?: string }).type === 'conflict'
        ) as { activeControllers?: string[] } | undefined

        expect(conflict?.activeControllers).toEqual(['local-notices', 'runtime-surface'])
    })
})
