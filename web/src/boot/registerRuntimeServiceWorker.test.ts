import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const registerSWMock = vi.fn()
const publishRuntimeUpdateReadyMock = vi.fn()

vi.mock('virtual:pwa-register', () => ({
    registerSW: (options: unknown) => registerSWMock(options)
}))

vi.mock('@/lib/runtimeUpdateChannel', () => ({
    publishRuntimeUpdateReady: (action: unknown) => publishRuntimeUpdateReadyMock(action)
}))

describe('registerRuntimeServiceWorker', () => {
    const originalRequestIdleCallback = window.requestIdleCallback

    beforeEach(() => {
        registerSWMock.mockReset()
        publishRuntimeUpdateReadyMock.mockReset()
    })

    afterEach(() => {
        if (originalRequestIdleCallback) {
            Object.defineProperty(window, 'requestIdleCallback', {
                configurable: true,
                value: originalRequestIdleCallback
            })
            return
        }

        Reflect.deleteProperty(window, 'requestIdleCallback')
    })

    it('publishes the runtime update apply action through the shared channel', async () => {
        const updateSWMock = vi.fn(async () => undefined)
        registerSWMock.mockReturnValue(updateSWMock)

        const { registerRuntimeServiceWorker } = await import('./registerRuntimeServiceWorker')
        await registerRuntimeServiceWorker()

        const options = registerSWMock.mock.calls[0]?.[0] as {
            onNeedRefresh?: () => void
        }
        expect(options).toBeDefined()

        options.onNeedRefresh?.()

        expect(publishRuntimeUpdateReadyMock).toHaveBeenCalledTimes(1)
        const apply = publishRuntimeUpdateReadyMock.mock.calls[0]?.[0] as (() => Promise<void>)
        await apply()
        expect(updateSWMock).toHaveBeenCalledWith(true)
    })

    it('schedules registration during idle time when supported', async () => {
        registerSWMock.mockReturnValue(vi.fn(async () => undefined))
        const requestIdleCallbackMock = vi.fn((callback: IdleRequestCallback) => {
            callback({
                didTimeout: false,
                timeRemaining: () => 16
            })
            return 1
        })
        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            value: requestIdleCallbackMock
        })

        const { scheduleRuntimeServiceWorkerRegistration } = await import('./registerRuntimeServiceWorker')
        scheduleRuntimeServiceWorkerRegistration()

        expect(requestIdleCallbackMock).toHaveBeenCalledTimes(1)
        expect(registerSWMock).toHaveBeenCalledTimes(1)
    })
})
