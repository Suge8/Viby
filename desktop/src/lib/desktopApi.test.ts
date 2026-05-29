import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { DesktopPairingSession, HubSnapshot } from '@/types'

const invokeMock = mock(async () => undefined)
const listenMock = mock(async () => () => {})
const checkMock = mock(async () => null)
const PREVIEW_MESSAGE = '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

mock.module('@tauri-apps/api/core', () => ({
    invoke: invokeMock,
}))

mock.module('@tauri-apps/api/event', () => ({
    listen: listenMock,
}))

mock.module('@tauri-apps/plugin-updater', () => ({
    check: checkMock,
}))

const desktopApi = await import('./desktopApi')

const snapshotFixture: HubSnapshot = {
    running: true,
    managed: true,
    logPath: '/tmp/desktop.log',
    startupConfig: {
        listenHost: '127.0.0.1',
        listenPort: 37173,
        publicAccessEnabled: true,
    },
    status: {
        phase: 'ready',
        pid: 42,
        launchSource: 'desktop',
        listenHost: '127.0.0.1',
        listenPort: 37173,
        localHubUrl: 'http://127.0.0.1:37173',
        preferredBrowserUrl: 'http://127.0.0.1:37173',
        publicUrl: 'http://127.0.0.1:37173',
        publicAccessEnabled: true,
        pairingBrokerUrl: 'https://pair.viby.run',
        hubOwnerToken: 'token',
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
        shortCode: null,
        approvalStatus: null,
        host: {
            tokenHint: 'abcdef',
            label: 'Viby Desktop',
        },
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    tunnelUrl: 'wss://pair.example.com/pairings/pairing-1/tunnel?token=host-token',
    iceServers: [],
}

beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
    checkMock.mockReset()
    invokeMock.mockImplementation(async () => undefined)
    listenMock.mockImplementation(async () => () => {})
    checkMock.mockImplementation(async () => null)
    ;(globalThis as typeof globalThis & { window?: unknown }).window = {
        __TAURI_INTERNALS__: {
            invoke: () => undefined,
        },
    }
})

describe('desktopApi', () => {
    it('rejects desktop commands when the tauri runtime is unavailable', async () => {
        ;(globalThis as typeof globalThis & { window?: unknown }).window = {}

        await expect(desktopApi.openUrl('http://example.test')).rejects.toThrow(PREVIEW_MESSAGE)
    })

    it('opens a concrete entry URL without asking the hub to choose one', async () => {
        await desktopApi.openUrl('http://192.168.12.34:37173')

        expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'http://192.168.12.34:37173' })
    })

    it('starts the desktop-managed hub through the dedicated command', async () => {
        invokeMock.mockResolvedValueOnce(snapshotFixture)

        await expect(desktopApi.startHub()).resolves.toBe(snapshotFixture)
        expect(invokeMock).toHaveBeenCalledWith('start_hub', undefined)
    })

    it('applies the public access switch through the dedicated desktop command', async () => {
        invokeMock.mockResolvedValueOnce(snapshotFixture)

        await expect(desktopApi.setPublicAccessEnabled(false)).resolves.toBe(snapshotFixture)
        expect(invokeMock).toHaveBeenCalledWith('set_public_access_enabled', { enabled: false })
    })

    it('loads every durable pairing session through the multi-pairing desktop command', async () => {
        invokeMock.mockResolvedValueOnce([pairingFixture])

        await expect(desktopApi.getPairingSessions()).resolves.toEqual([pairingFixture])
        expect(invokeMock).toHaveBeenCalledWith('get_pairing_sessions', undefined)
    })

    it('clears every durable pairing session through the multi-pairing desktop command', async () => {
        await desktopApi.clearPairingSessions()

        expect(invokeMock).toHaveBeenCalledWith('clear_pairing_sessions', undefined)
    })

    it('removes one durable pairing session by id through the desktop command', async () => {
        await desktopApi.removePairingSession('pairing-1')

        expect(invokeMock).toHaveBeenCalledWith('remove_pairing_session', { pairingId: 'pairing-1' })
    })

    it('requests a pairing session through the dedicated desktop command', async () => {
        invokeMock.mockResolvedValueOnce(pairingFixture)

        await expect(desktopApi.createPairingSession()).resolves.toEqual(pairingFixture)
        expect(invokeMock).toHaveBeenCalledWith('create_pairing_session', undefined)
    })

    it('refreshes a pairing session through the dedicated desktop command', async () => {
        invokeMock.mockResolvedValueOnce({
            ...pairingFixture,
            pairing: {
                ...pairingFixture.pairing,
                shortCode: '490649',
                approvalStatus: 'approved',
                guest: {
                    label: 'Device',
                },
            },
        })

        await expect(desktopApi.refreshPairingSession(pairingFixture)).resolves.toMatchObject({
            pairing: {
                shortCode: '490649',
                approvalStatus: 'approved',
            },
        })
        expect(invokeMock).toHaveBeenCalledWith('refresh_pairing_session', { pairing: pairingFixture })
    })

    it('deletes a pairing session through the dedicated desktop command', async () => {
        await desktopApi.deletePairingSession(pairingFixture)

        expect(invokeMock).toHaveBeenCalledWith('delete_pairing_session', { pairing: pairingFixture })
    })

    it('checks desktop updates through the Tauri updater owner', async () => {
        const update = {
            version: '0.3.0',
            currentVersion: '0.2.0',
            date: '2026-04-25T00:00:00Z',
            body: 'Desktop updater',
            close: mock(async () => undefined),
            downloadAndInstall: mock(async () => undefined),
        }
        checkMock.mockResolvedValueOnce(update)

        await expect(desktopApi.checkForDesktopUpdate()).resolves.toEqual({
            version: '0.3.0',
            currentVersion: '0.2.0',
            date: '2026-04-25T00:00:00Z',
            body: 'Desktop updater',
        })
        expect(checkMock).toHaveBeenCalledTimes(1)
    })

    it('installs the pending desktop update', async () => {
        const update = {
            version: '0.3.0',
            currentVersion: '0.2.0',
            close: mock(async () => undefined),
            downloadAndInstall: mock(async () => undefined),
        }
        checkMock.mockResolvedValueOnce(update)

        await desktopApi.checkForDesktopUpdate()
        await desktopApi.installDesktopUpdate()

        expect(update.downloadAndInstall).toHaveBeenCalledTimes(1)
        expect(update.close).toHaveBeenCalledTimes(1)
    })

    it('rejects update install when no update is available', async () => {
        checkMock.mockResolvedValueOnce(null)

        await expect(desktopApi.installDesktopUpdate()).rejects.toThrow('没有可安装的桌面更新。')
    })

    it('forwards hub snapshot events to the caller callback', async () => {
        let eventHandler: ((event: { payload: HubSnapshot }) => void) | null = null
        const unlisten = () => undefined
        const onSnapshot = mock(() => undefined)

        listenMock.mockImplementation(async (_eventName, handler) => {
            eventHandler = handler as (event: { payload: HubSnapshot }) => void
            return unlisten
        })

        const teardown = await desktopApi.listenHubSnapshot(onSnapshot)

        expect(listenMock).toHaveBeenCalledWith('desktop://hub-snapshot', expect.any(Function))
        eventHandler?.({ payload: snapshotFixture })
        expect(onSnapshot).toHaveBeenCalledWith(snapshotFixture)
        expect(teardown).toBe(unlisten)
    })
})
