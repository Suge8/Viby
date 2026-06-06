import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RemotePairingRuntime } from './RemotePairingRuntime'
import type { RemoteWorkspaceRuntime } from './remoteWorkspaceAdapter'

const mocks = vi.hoisted(() => ({
    appFloatingNoticeLayer: vi.fn(() => null),
    useRealtimeEventBridge: vi.fn(),
}))

vi.mock('@/components/AppFloatingNoticeLayer', () => ({
    AppFloatingNoticeLayer: mocks.appFloatingNoticeLayer,
}))

vi.mock('@/hooks/useRealtimeConnection', () => ({
    useRealtimeEventBridge: mocks.useRealtimeEventBridge,
}))

describe('RemotePairingRuntime', () => {
    beforeEach(() => {
        mocks.appFloatingNoticeLayer.mockClear()
        mocks.useRealtimeEventBridge.mockClear()
    })

    it('uses the remote runtime view without exposing a full api path', async () => {
        const noticeApi = { getRuntime: vi.fn() }
        const runtime: RemoteWorkspaceRuntime = {
            noticeApi,
            getTransportStats: vi.fn(async () => ({ transport: 'websocket', reconnects: 0 }) as never),
            subscribe: vi.fn(() => () => undefined),
        }

        render(<RemotePairingRuntime runtime={runtime} />)

        expect(mocks.useRealtimeEventBridge).toHaveBeenCalledWith({
            enabled: true,
            subscribe: runtime.subscribe,
            onEvent: expect.any(Function),
        })
        await waitFor(() => {
            expect(mocks.appFloatingNoticeLayer).toHaveBeenCalledWith(
                expect.objectContaining({ api: noticeApi, banner: { kind: 'hidden' } }),
                undefined
            )
        })
        expect('api' in runtime).toBe(false)
    })
})
