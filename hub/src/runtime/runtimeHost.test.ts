import { beforeEach, describe, expect, it, vi } from 'bun:test'

import { createHubRuntimeHost } from './runtimeHost'

describe('createHubRuntimeHost', () => {
    const replaceRuntime = vi.fn()
    const disposeRuntime = vi.fn()
    const createRuntimeCore = vi.fn(() => ({
        syncEngine: {} as never,
        dispose: vi.fn(),
    }))
    const createWebFetch = vi.fn(async () => {
        return async () => new Response('ok')
    })
    const reload = vi.fn()
    const stop = vi.fn()
    const write = vi.fn(async () => ({}))
    const startRuntime = vi.fn(async () => {})
    const reloadRuntime = vi.fn()
    const stopRuntime = vi.fn(async () => null)

    beforeEach(() => {
        replaceRuntime.mockClear()
        disposeRuntime.mockClear()
        createRuntimeCore.mockClear()
        createWebFetch.mockClear()
        reload.mockClear()
        stop.mockClear()
        write.mockClear()
        startRuntime.mockClear()
        reloadRuntime.mockClear()
        stopRuntime.mockClear()
    })

    it('reloads runtime core and web fetch together', async () => {
        const host = createHubRuntimeHost({
            runtimeAccessor: {
                getRuntime: () => null,
                getSyncEngine: () => null,
                replaceRuntime,
                disposeRuntime,
            },
            createRuntimeCore,
            createWebFetch,
            webServer: { reload, stop } as never,
            runtimeStatus: { filePath: '/tmp/status.json', write } as never,
            runtimeController: {
                start: startRuntime,
                reload: reloadRuntime,
                stop: stopRuntime,
            },
            preferredBrowserUrl: 'https://hub.example.test',
            portFallbackMessage: null,
        })

        await host.reloadRuntime()

        expect(createRuntimeCore).toHaveBeenCalledTimes(1)
        expect(createWebFetch).toHaveBeenCalledTimes(1)
        expect(replaceRuntime).toHaveBeenCalledTimes(1)
        expect(reload).toHaveBeenCalledTimes(1)
        expect(reloadRuntime).toHaveBeenCalledTimes(1)
    })

    it('starts runtime before local runtime controller', async () => {
        const host = createHubRuntimeHost({
            runtimeAccessor: {
                getRuntime: () => null,
                getSyncEngine: () => null,
                replaceRuntime,
                disposeRuntime,
            },
            createRuntimeCore,
            createWebFetch,
            webServer: { reload, stop } as never,
            runtimeStatus: { filePath: '/tmp/status.json', write } as never,
            runtimeController: {
                start: startRuntime,
                reload: reloadRuntime,
                stop: stopRuntime,
            },
            preferredBrowserUrl: 'https://hub.example.test',
            portFallbackMessage: null,
        })

        await host.start()

        expect(write).toHaveBeenCalledWith({
            phase: 'starting',
            preferredBrowserUrl: 'https://hub.example.test',
            message: '本地中枢已启动，正在连接这台机器。',
        })
        expect(startRuntime).toHaveBeenCalledTimes(1)
    })

    it('disposes runtime and stops web server on shutdown', async () => {
        const host = createHubRuntimeHost({
            runtimeAccessor: {
                getRuntime: () => null,
                getSyncEngine: () => null,
                replaceRuntime,
                disposeRuntime,
            },
            createRuntimeCore,
            createWebFetch,
            webServer: { reload, stop } as never,
            runtimeStatus: { filePath: '/tmp/status.json', write } as never,
            runtimeController: {
                start: startRuntime,
                reload: reloadRuntime,
                stop: stopRuntime,
            },
            preferredBrowserUrl: 'https://hub.example.test',
            portFallbackMessage: null,
        })

        await expect(host.shutdown()).resolves.toBe(0)

        expect(stopRuntime).toHaveBeenCalledTimes(1)
        expect(disposeRuntime).toHaveBeenCalledTimes(1)
        expect(stop).toHaveBeenCalledTimes(1)
    })
})
