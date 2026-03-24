import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { HubSnapshot } from '@/types'

const invokeMock = mock(async () => undefined)
const listenMock = mock(async () => () => {})
const PREVIEW_MESSAGE = '当前运行在浏览器预览环境，Tauri runtime 不可用。请使用 bun run dev:desktop 启动桌面壳。'

mock.module('@tauri-apps/api/core', () => ({
    invoke: invokeMock
}))

mock.module('@tauri-apps/api/event', () => ({
    listen: listenMock
}))

const desktopApi = await import('./desktopApi')

const snapshotFixture: HubSnapshot = {
    running: true,
    managed: true,
    logPath: '/tmp/desktop.log',
    startupConfig: {
        listenHost: '127.0.0.1',
        listenPort: 37173
    },
    status: {
        phase: 'ready',
        pid: 42,
        launchSource: 'desktop',
        listenHost: '127.0.0.1',
        listenPort: 37173,
        localHubUrl: 'http://127.0.0.1:37173',
        preferredBrowserUrl: 'http://127.0.0.1:37173',
        cliApiToken: 'token',
        settingsFile: '/tmp/settings.toml',
        dataDir: '/tmp',
        startedAt: '2026-03-24T00:00:00.000Z',
        updatedAt: '2026-03-24T00:00:00.000Z'
    }
}

beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
    invokeMock.mockImplementation(async () => undefined)
    listenMock.mockImplementation(async () => () => {})
    ;(globalThis as typeof globalThis & { window?: unknown }).window = {
        __TAURI_INTERNALS__: {
            invoke: () => undefined
        }
    }
})

describe('desktopApi', () => {
    it('rejects desktop commands when the tauri runtime is unavailable', async () => {
        ;(globalThis as typeof globalThis & { window?: unknown }).window = {}

        await expect(desktopApi.openPreferredUrl()).rejects.toThrow(PREVIEW_MESSAGE)
    })

    it('opens the current entry through the single preferred-url command', async () => {
        await desktopApi.openPreferredUrl()

        expect(invokeMock).toHaveBeenCalledWith('open_preferred_url', undefined)
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
