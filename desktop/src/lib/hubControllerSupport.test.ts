import { describe, expect, it, mock } from 'bun:test'
import type { DesktopEntryMode, DesktopPairingSession, HubSnapshot } from '@/types'
import { applyHubSnapshot, createPairingAction, DESKTOP_PREVIEW_MESSAGE, runHubAction } from './hubControllerSupport'

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
        entryMode: 'local' as DesktopEntryMode,
        setSnapshot(next: HubSnapshot | null) {
            this.snapshot = next
        },
        setActionError(next: string | null) {
            this.actionError = next
        },
        setEntryMode(next: DesktopEntryMode) {
            this.entryMode = next
        },
    }
}

describe('hubControllerSupport', () => {
    it('applies the initial entry mode from the first snapshot only once', () => {
        const harness = createSetterHarness()

        applyHubSnapshot(readySnapshot, {
            setSnapshot: harness.setSnapshot.bind(harness),
            setActionError: harness.setActionError.bind(harness),
            setEntryMode: harness.setEntryMode.bind(harness),
            useInitialEntryMode: true,
        })

        expect(harness.snapshot).toEqual(readySnapshot)
        expect(harness.actionError).toBeNull()
        expect(harness.entryMode).toBe('lan')
    })

    it('updates the live entry mode from the running listen host', () => {
        const harness = createSetterHarness()

        applyHubSnapshot(readySnapshot, {
            setSnapshot: harness.setSnapshot.bind(harness),
            setActionError: harness.setActionError.bind(harness),
            setEntryMode: harness.setEntryMode.bind(harness),
        })

        expect(harness.entryMode).toBe('lan')
    })

    it('blocks hub actions when the tauri runtime is unavailable', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)

        await runHubAction({
            tauriRuntimeAvailable: false,
            setBusy,
            setActionError,
            refresh: async () => undefined,
            applySnapshot: () => undefined,
            clearPairing: () => undefined,
            action: async () => readySnapshot,
        })

        expect(setBusy).not.toHaveBeenCalled()
        expect(setActionError).toHaveBeenCalledWith(DESKTOP_PREVIEW_MESSAGE)
    })

    it('refreshes when a hub action does not return a new snapshot', async () => {
        const setBusy = mock(() => undefined)
        const setActionError = mock(() => undefined)
        const refresh = mock(async () => undefined)
        const applySnapshotMock = mock(() => undefined)

        await runHubAction({
            tauriRuntimeAvailable: true,
            setBusy,
            setActionError,
            refresh,
            applySnapshot: applySnapshotMock,
            clearPairing: () => undefined,
            action: async () => undefined,
        })

        expect(refresh).toHaveBeenCalledTimes(1)
        expect(applySnapshotMock).not.toHaveBeenCalled()
        expect(setBusy.mock.calls).toEqual([[true], [false]])
    })

    it('clears pairing when a hub action returns a stopped snapshot', async () => {
        const stoppedSnapshot = { ...readySnapshot, running: false }
        const applySnapshotMock = mock(() => undefined)
        const clearPairing = mock(() => undefined)

        await runHubAction({
            tauriRuntimeAvailable: true,
            setBusy: () => undefined,
            setActionError: () => undefined,
            refresh: async () => undefined,
            applySnapshot: applySnapshotMock,
            clearPairing,
            action: async () => stoppedSnapshot,
        })

        expect(applySnapshotMock).toHaveBeenCalledWith(stoppedSnapshot)
        expect(clearPairing).toHaveBeenCalledTimes(1)
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
})
