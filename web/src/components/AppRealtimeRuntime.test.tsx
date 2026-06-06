import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRealtimeRuntime } from '@/components/AppRealtimeRuntime'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'

const realtimeConnectionHarness = vi.hoisted(() => ({
    options: null as null | Parameters<typeof import('@/hooks/useRealtimeConnection').useRealtimeConnection>[0],
}))

const runRealtimeRecoveryMock = vi.hoisted(() => vi.fn(async (_options: unknown) => undefined))
const addToastMock = vi.hoisted(() => vi.fn())
const floatingNoticeBanners = vi.hoisted(() => [] as unknown[])

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        invalidateQueries: vi.fn(async () => undefined),
    }),
}))

const routerLocation = vi.hoisted(() => ({ pathname: '/sessions/session-1', search: '', hash: '', state: null }))

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({ select }: { select: (location: typeof routerLocation) => string }) => select(routerLocation),
    useMatchRoute: () => () => ({ sessionId: 'session-1' }),
    useRouter: () => ({
        history: {
            location: routerLocation,
            replace: vi.fn(),
        },
    }),
}))

vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: () => ({
        isSupported: false,
        permission: 'default',
        ensureSubscription: vi.fn(async () => undefined),
        pushEndpoint: null,
    }),
}))

vi.mock('@/hooks/useRealtimeConnection', () => ({
    useRealtimeConnection: (
        options: Parameters<typeof import('@/hooks/useRealtimeConnection').useRealtimeConnection>[0]
    ) => {
        realtimeConnectionHarness.options = options
    },
}))

vi.mock('@/lib/realtimeRecovery', () => ({
    runRealtimeRecovery: (options: unknown) => runRealtimeRecoveryMock(options),
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({
        addToast: addToastMock,
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/components/AppFloatingNoticeLayer', () => ({
    AppFloatingNoticeLayer: (props: { banner: unknown }) => {
        floatingNoticeBanners.push(props.banner)
        return null
    },
}))

describe('AppRealtimeRuntime', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        realtimeConnectionHarness.options = null
        runRealtimeRecoveryMock.mockReset()
        addToastMock.mockReset()
        floatingNoticeBanners.length = 0
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        resetForegroundPulseForTests()
    })

    it('does not run silent stale recovery', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        act(() => {
            realtimeConnectionHarness.options?.onConnect?.({
                initial: true,
                recovered: false,
                transport: 'websocket',
            })
        })

        await act(async () => {
            vi.advanceTimersByTime(60_000)
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock).not.toHaveBeenCalled()
    })

    it('forwards socket reconnect into authoritative recovery', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        await act(async () => {
            await realtimeConnectionHarness.options?.onConnect?.({
                initial: false,
                recovered: true,
                transport: 'websocket',
            })
        })

        expect(runRealtimeRecoveryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                api: {},
                selectedSessionId: 'session-1',
            })
        )
    })

    it('forwards foreground visible/resume through runtime dedupe', async () => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        })
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'))
            document.dispatchEvent(new Event('resume'))
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock).toHaveBeenCalledTimes(1)
    })

    it('forwards pageshow-restored into recovery', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)
        const event = new Event('pageshow')
        Object.defineProperty(event, 'persisted', { value: true })

        await act(async () => {
            window.dispatchEvent(event)
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock).toHaveBeenCalledWith(
            expect.objectContaining({
                api: {},
                selectedSessionId: 'session-1',
            })
        )
    })

    it('passes runtime state into notice presentation', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)
        await act(async () => {
            await Promise.resolve()
        })

        act(() => {
            realtimeConnectionHarness.options?.onConnect?.({ initial: true, recovered: false, transport: 'websocket' })
            realtimeConnectionHarness.options?.onDisconnect?.('transport close')
        })
        await act(async () => {
            await Promise.resolve()
        })

        expect(floatingNoticeBanners).toContainEqual({ kind: 'busy' })
    })
})
