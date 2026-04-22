import { afterEach, describe, expect, it, vi } from 'vitest'
import { consumePendingAppRecovery } from '@/lib/appRecovery'
import { isLikelyRuntimeAssetFailure, recordRuntimeAssetFailureRecovery } from '@/lib/runtimeAssetFailure'
import { isLocalNetworkOrigin, isLoopbackOrigin, shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetPolicy'
import {
    clearRuntimeAssetRecoveryMarker,
    disableServiceWorkerForCurrentOrigin,
    publishRuntimeUpdateForBuild,
    recoverRuntimeAssets,
} from '@/lib/runtimeAssetRecovery'
import {
    applyPendingRuntimeUpdate,
    readPendingRuntimeUpdate,
    resetPendingRuntimeUpdate,
} from '@/lib/runtimeUpdateChannel'

describe('runtimeAssetRecovery', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        window.localStorage.clear()
        window.sessionStorage.clear()
        clearRuntimeAssetRecoveryMarker()
        resetPendingRuntimeUpdate()
    })

    it('detects runtime asset failures from asset filenames', () => {
        expect(
            isLikelyRuntimeAssetFailure({
                filename: 'https://example.com/assets/vendor-assistant-CTzFxex6.js',
                message: 'Loading module from https://example.com/assets/vendor-assistant-CTzFxex6.js failed.',
            })
        ).toBe(true)
    })

    it('detects runtime asset failures from known module loading messages', () => {
        expect(
            isLikelyRuntimeAssetFailure({
                message: 'Failed to fetch dynamically imported module',
            })
        ).toBe(true)
    })

    it('does not treat generic initialization errors as runtime asset failures without asset evidence', () => {
        expect(
            isLikelyRuntimeAssetFailure({
                message: "Cannot access 'SessionList' before initialization",
            })
        ).toBe(false)
    })

    it('does not treat generic initialization errors inside asset stacks as runtime asset failures', () => {
        expect(
            isLikelyRuntimeAssetFailure({
                message: "Cannot access 'tt' before initialization",
                stack: "ReferenceError: Cannot access 'tt' before initialization\n    at https://example.com/assets/tanstack.js:1:1",
            })
        ).toBe(false)
    })

    it('records pending recovery only for confirmed asset failures', () => {
        expect(
            recordRuntimeAssetFailureRecovery({
                reason: 'runtime-asset-reload',
                failure: {
                    message: "Cannot access 'SessionList' before initialization",
                },
                resumeHref: '/sessions/session-1',
            })
        ).toBe(false)
        expect(consumePendingAppRecovery()).toBeNull()

        expect(
            recordRuntimeAssetFailureRecovery({
                reason: 'runtime-asset-reload',
                failure: {
                    stack: 'TypeError at https://example.com/assets/chat.js:1:1',
                },
                resumeHref: '/sessions/session-1',
            })
        ).toBe(false)
        expect(consumePendingAppRecovery()).toBeNull()

        expect(
            recordRuntimeAssetFailureRecovery({
                reason: 'runtime-asset-reload',
                failure: {
                    message: 'Failed to fetch dynamically imported module: https://example.com/assets/chat.js',
                },
                resumeHref: '/sessions/session-1',
            })
        ).toBe(true)
        expect(consumePendingAppRecovery()).toMatchObject({
            reason: 'runtime-asset-reload',
            resumeHref: '/sessions/session-1',
        })
    })

    it('detects loopback origins for local runtime cleanup', () => {
        expect(isLoopbackOrigin('http://127.0.0.1:37173')).toBe(true)
        expect(isLoopbackOrigin('http://localhost:37173')).toBe(true)
        expect(isLoopbackOrigin('https://app.viby.run')).toBe(false)
    })

    it('detects local network origins beyond loopback', () => {
        expect(isLocalNetworkOrigin('http://192.168.1.10:37173')).toBe(true)
        expect(isLocalNetworkOrigin('https://100.88.12.5:37173')).toBe(true)
        expect(isLocalNetworkOrigin('https://studio.example.com')).toBe(false)
    })

    it('registers service workers only for non-local https origins', () => {
        expect(shouldRegisterServiceWorkerForOrigin('https://app.viby.run')).toBe(true)
        expect(shouldRegisterServiceWorkerForOrigin('http://127.0.0.1:37173')).toBe(false)
        expect(shouldRegisterServiceWorkerForOrigin('https://192.168.1.10:37173')).toBe(false)
    })

    it('unregisters service workers and clears caches when recovering', async () => {
        const unregister = vi.fn().mockResolvedValue(true)
        const getRegistrations = vi.fn().mockResolvedValue([{ unregister }])
        const deleteCache = vi.fn().mockResolvedValue(true)
        const keys = vi.fn().mockResolvedValue(['precache-v1'])

        vi.stubGlobal('navigator', {
            ...navigator,
            serviceWorker: { getRegistrations },
        })
        vi.stubGlobal('caches', {
            keys,
            delete: deleteCache,
        })

        await expect(recoverRuntimeAssets('runtime:error')).resolves.toBe(true)
        expect(getRegistrations).toHaveBeenCalledTimes(1)
        expect(unregister).toHaveBeenCalledTimes(1)
        expect(keys).toHaveBeenCalledTimes(1)
        expect(deleteCache).toHaveBeenCalledWith('precache-v1')
    })

    it('avoids repeating the same recovery attempt in one tab session', async () => {
        vi.stubGlobal('navigator', {
            ...navigator,
            serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
        })
        vi.stubGlobal('caches', {
            keys: vi.fn().mockResolvedValue([]),
            delete: vi.fn(),
        })

        await expect(recoverRuntimeAssets('runtime:error')).resolves.toBe(true)
        await expect(recoverRuntimeAssets('runtime:error')).resolves.toBe(false)
    })

    it('publishes a one-shot runtime update when app build id changes', async () => {
        const reload = vi.fn()
        const location = window.location
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: {
                ...location,
                reload,
            },
        })
        window.localStorage.setItem('viby-app-build-id', '0.1.0-older-build')

        expect(publishRuntimeUpdateForBuild('0.1.0-newer-build')).toBe(true)
        expect(readPendingRuntimeUpdate()).not.toBeNull()

        await expect(applyPendingRuntimeUpdate()).resolves.toBe(true)
        expect(reload).toHaveBeenCalledTimes(1)
    })

    it('cleans local service workers and requests one reload when already controlled', async () => {
        const unregister = vi.fn().mockResolvedValue(true)
        const getRegistrations = vi.fn().mockResolvedValue([{ unregister }])
        const deleteCache = vi.fn().mockResolvedValue(true)
        const keys = vi.fn().mockResolvedValue(['local-cache'])

        vi.stubGlobal('navigator', {
            ...navigator,
            serviceWorker: {
                controller: {},
                getRegistrations,
            },
        })
        vi.stubGlobal('caches', {
            keys,
            delete: deleteCache,
        })

        await expect(disableServiceWorkerForCurrentOrigin()).resolves.toBe(true)
        expect(unregister).toHaveBeenCalledTimes(1)
        expect(deleteCache).toHaveBeenCalledWith('local-cache')

        await expect(disableServiceWorkerForCurrentOrigin()).resolves.toBe(false)
    })
})
