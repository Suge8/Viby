import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useAppContext } from '@/lib/app-context'
import { createBridge } from './remotePeerApiClient.test.support'
import { createRemoteWorkspaceAdapter } from './remoteWorkspaceAdapter'

function AppContextProbe(props: { onApi: (api: unknown) => void }): null {
    props.onApi(useAppContext().api)
    return null
}

describe('createRemoteWorkspaceAdapter', () => {
    it('owns the app shell session and keeps bridge/runtime wiring internal', async () => {
        const bridge = createBridge()
        const queryClient = new QueryClient()

        const workspace = createRemoteWorkspaceAdapter({
            baseUrl: 'https://viby.local',
            bridge,
            queryClient,
            token: 'guest-token',
        })

        expect(workspace.appSession).toMatchObject({ baseUrl: 'https://viby.local' })
        expect('api' in workspace.appSession).toBe(false)
        expect('getAppContext' in workspace.appSession).toBe(false)
        expect('readRuntimeContext' in workspace.appSession).toBe(false)
        expect('api' in workspace.runtime).toBe(false)
        expect('bridge' in workspace.runtime).toBe(false)
        expect('getSessionView' in workspace.runtime.noticeApi).toBe(false)
        await expect(workspace.runtime.getTransportStats()).resolves.toBeDefined()
        await expect(workspace.runtime.noticeApi.getRuntime()).resolves.toMatchObject({ runtime: { id: 'machine-1' } })
        expect(bridge.getRuntime).toHaveBeenCalled()
    })

    it('provides a wrapped app api instead of the remote peer client object', () => {
        const workspace = createRemoteWorkspaceAdapter({
            baseUrl: 'https://viby.local',
            bridge: createBridge(),
            queryClient: new QueryClient(),
            token: 'guest-token',
        })
        const onApi = vi.fn()

        render(workspace.appSession.renderAppProvider(createElement(AppContextProbe, { onApi })))

        const appApi = onApi.mock.calls[0]?.[0] as Record<string, unknown>
        expect(appApi).toBeDefined()
        expect(Object.getPrototypeOf(appApi)).toBe(Object.prototype)
        expect(typeof appApi.getSessionView).toBe('function')
        expect('request' in appApi).toBe(false)
    })
})
