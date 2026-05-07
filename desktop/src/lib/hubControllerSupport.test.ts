import { describe, expect, it, mock } from 'bun:test'
import type { DesktopPairingSession, HubSnapshot } from '@/types'
import {
    applyHubSnapshot,
    createPairingAction,
    DESKTOP_PREVIEW_MESSAGE,
    deletePairingAction,
    isExpiredUnclaimedPairing,
    isStalePairingRefreshError,
    recreatePairingAction,
    runHubAction,
} from './hubControllerSupport'

const readySnapshot: HubSnapshot = {
    running: true,
    managed: true,
    logPath: '/tmp/desktop.log',
    startupConfig: {
        listenHost: '127.0.0.1',
        listenPort: 37173,
    },
    status: {
        phase: 'ready',
        pid: 42,
        launchSource: 'desktop',
        listenHost: '0.0.0.0',
        listenPort: 37173,
        localHubUrl: 'http://127.0.0.1:37173',
        preferredBrowserUrl: 'http://127.0.0.1:37173',
        cliApiToken: 'token',
        settingsFile: '/tmp/settings.toml',
        dataDir: '/tmp',
        startedAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z',
    },
}

const pairingFixture: DesktopPairingSession = {
    pairing: {
        id: 'pairing-1',
        state: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        ticketExpiresAt: 2,
        host: { tokenHint: 'abcdef', label: 'Viby Desktop' },
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    iceServers: [],
}

function createSetterHarness() {
    return {
        snapshot: null as HubSnapshot | null,
        actionError: 'stale',
        setSnapshot(next: HubSnapshot | null) {
            this.snapshot = next
        },
        setActionError(next: string | null) {
            this.actionError = next
        },
    }
}

describe('hubControllerSupport', () => {
    it('applies snapshots without deriving a second entry mode owner', () => {
        const harness = createSetterHarness()

        applyHubSnapshot(readySnapshot, {
            setSnapshot: harness.setSnapshot.bind(harness),
            setActionError: harness.setActionError.bind(harness),
        })

        expect(harness.snapshot).toEqual(readySnapshot)
        expect(harness.actionError).toBeNull()
    })

    it('blocks hub actions when the tauri runtime is unavailable', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)

        const result = await runHubAction({
            tauriRuntimeAvailable: false,
            setBusy,
            setActionError,
            refresh: async () => undefined,
            applySnapshot: () => undefined,
            action: async () => readySnapshot,
        })

        expect(setBusy).not.toHaveBeenCalled()
        expect(setActionError).toHaveBeenCalledWith(DESKTOP_PREVIEW_MESSAGE)
        expect(result).toBe(false)
    })

    it('refreshes when a hub action does not return a new snapshot', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)
        const refresh = mock(async () => undefined)
        const applySnapshotMock = mock(() => undefined)

        const result = await runHubAction({
            tauriRuntimeAvailable: true,
            setBusy,
            setActionError,
            refresh,
            applySnapshot: applySnapshotMock,
            action: async () => undefined,
        })

        expect(refresh).toHaveBeenCalledTimes(1)
        expect(applySnapshotMock).not.toHaveBeenCalled()
        expect(setBusy.mock.calls).toEqual([[true], [false]])
        expect(result).toBe(true)
    })

    it('keeps pairing state durable when a hub action returns a stopped snapshot', async () => {
        const stoppedSnapshot = { ...readySnapshot, running: false }
        const applySnapshotMock = mock(() => undefined)

        await runHubAction({
            tauriRuntimeAvailable: true,
            setBusy: () => undefined,
            setActionError: () => undefined,
            refresh: async () => undefined,
            applySnapshot: applySnapshotMock,
            action: async () => stoppedSnapshot,
        })

        expect(applySnapshotMock).toHaveBeenCalledWith(stoppedSnapshot)
    })

    it('reports pairing creation failures through the shared preview/error flow', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)
        const setPairing = mock(() => undefined)

        await createPairingAction({
            tauriRuntimeAvailable: true,
            setBusy,
            setActionError,
            setPairing,
            createPairingSession: async () => {
                throw new Error('boom')
            },
        })

        expect(setActionError).toHaveBeenCalledWith('boom')
        expect(setPairing).not.toHaveBeenCalledWith(pairingFixture)
        expect(setBusy.mock.calls).toEqual([[true], [false]])
    })

    it('regenerates pairing when stale broker delete fails', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)
        const setPairing = mock(() => undefined)
        const nextPairing = { ...pairingFixture, hostToken: 'host-token-2' }

        const regenerated = await recreatePairingAction({
            tauriRuntimeAvailable: true,
            pairing: pairingFixture,
            setBusy,
            setActionError,
            setPairing,
            deletePairingSession: async () => {
                throw new Error('Invalid pairing token')
            },
            createPairingSession: async () => nextPairing,
        })

        expect(regenerated).toBe(true)
        expect(setPairing).toHaveBeenCalledWith(nextPairing)
        expect(setActionError).toHaveBeenCalledWith(null)
        expect(setBusy.mock.calls).toEqual([[true], [false]])
    })

    it('clears local binding when explicit delete sees a stale broker session', async () => {
        const clearPairing = mock(async () => undefined)

        await deletePairingAction({
            tauriRuntimeAvailable: true,
            pairing: pairingFixture,
            setBusy: () => undefined,
            setActionError: () => undefined,
            clearPairing,
            deletePairingSession: async () => {
                throw new Error('Pairing session not found')
            },
        })

        expect(clearPairing).toHaveBeenCalledTimes(1)
    })

    it('does not clear local binding when explicit delete hits an unknown failure', async () => {
        const clearPairing = mock(async () => undefined)
        const setActionError = mock(() => undefined)

        await deletePairingAction({
            tauriRuntimeAvailable: true,
            pairing: pairingFixture,
            setBusy: () => undefined,
            setActionError,
            clearPairing,
            deletePairingSession: async () => {
                throw new Error('network down')
            },
        })

        expect(clearPairing).not.toHaveBeenCalled()
        expect(setActionError).toHaveBeenCalledWith('network down')
    })

    it('detects expired unclaimed QR invites without killing claimed devices', () => {
        expect(isExpiredUnclaimedPairing(pairingFixture, 3)).toBe(true)
        expect(
            isExpiredUnclaimedPairing(
                {
                    ...pairingFixture,
                    pairing: { ...pairingFixture.pairing, guest: { label: 'Phone' } },
                },
                3
            )
        ).toBe(false)
    })

    it('classifies expired persisted pairing sessions as refresh-stale', () => {
        expect(isStalePairingRefreshError(new Error('Pairing session no longer active'))).toBe(true)
        expect(isStalePairingRefreshError(new Error('network down'))).toBe(false)
    })

    it('does not hide unexpected pairing delete failures', async () => {
        const setPairing = mock(() => undefined)
        const setActionError = mock(() => undefined)

        const regenerated = await recreatePairingAction({
            tauriRuntimeAvailable: true,
            pairing: pairingFixture,
            setBusy: () => undefined,
            setActionError,
            setPairing,
            deletePairingSession: async () => {
                throw new Error('network down')
            },
            createPairingSession: async () => pairingFixture,
        })

        expect(regenerated).toBe(false)
        expect(setActionError).toHaveBeenCalledWith('network down')
        expect(setPairing).not.toHaveBeenCalled()
    })
})
