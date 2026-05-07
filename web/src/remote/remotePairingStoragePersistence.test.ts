import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestRemotePairingPersistentStorage } from './remotePairingStoragePersistence'

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('remotePairingStoragePersistence', () => {
    it('requests persistent origin storage when the browser supports it', async () => {
        const persist = vi.fn(async () => true)
        vi.stubGlobal('navigator', { ...navigator, storage: { persist } })

        await expect(requestRemotePairingPersistentStorage()).resolves.toBe(true)
        expect(persist).toHaveBeenCalledTimes(1)
    })

    it('keeps pairing usable when persistent storage is unavailable', async () => {
        vi.stubGlobal('navigator', { ...navigator, storage: undefined })

        await expect(requestRemotePairingPersistentStorage()).resolves.toBe(false)
    })
})
