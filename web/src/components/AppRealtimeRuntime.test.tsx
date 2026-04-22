import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRealtimeRuntime } from '@/components/AppRealtimeRuntime'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'

const realtimeConnectionHarness = vi.hoisted(() => ({
    options: null as null | Parameters<typeof import('@/hooks/useRealtimeConnection').useRealtimeConnection>[0],
}))

const runRealtimeRecoveryMock = vi.hoisted(() => vi.fn(async (_options: unknown) => undefined))
const addToastMock = vi.hoisted(() => vi.fn())
const catchupSyncCalls = vi.hoisted(() => [] as Array<{ silent?: boolean }>)

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        invalidateQueries: vi.fn(async () => undefined),
    }),
}))

vi.mock('@tanstack/react-router', () => ({
    useMatchRoute: () => () => ({ sessionId: 'session-1' }),
    useRouter: () => ({
        history: {
            location: { pathname: '/sessions/session-1', search: '', hash: '', state: null },
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

vi.mock('@/hooks/useRealtimeFeedback', () => ({
    useRealtimeFeedback: () => ({
        banner: { kind: 'hidden' },
        handleConnect: vi.fn(),
        handleDisconnect: vi.fn(),
        handleConnectError: vi.fn(),
        announceRecovery: vi.fn(),
        runCatchupSync: (task: Promise<unknown>, options?: { silent?: boolean }) => {
            catchupSyncCalls.push(options ?? {})
            void task
        },
    }),
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
    AppFloatingNoticeLayer: () => null,
}))

describe('AppRealtimeRuntime', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        realtimeConnectionHarness.options = null
        runRealtimeRecoveryMock.mockReset()
        addToastMock.mockReset()
        catchupSyncCalls.length = 0
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })
    })

    afterEach(() => {
        vi.useRealTimers()
        resetForegroundPulseForTests()
    })

    it('runs one authoritative recovery after realtime stays silently stale', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        expect(realtimeConnectionHarness.options).not.toBeNull()

        act(() => {
            realtimeConnectionHarness.options?.onConnect?.({
                initial: true,
                recovered: false,
                transport: 'websocket',
            })
        })

        await act(async () => {
            vi.advanceTimersByTime(44_000)
        })

        expect(runRealtimeRecoveryMock).not.toHaveBeenCalled()

        await act(async () => {
            vi.advanceTimersByTime(1_000)
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock.mock.calls.length).toBeGreaterThanOrEqual(1)
        expect(runRealtimeRecoveryMock.mock.calls.at(-1)?.[0]).toMatchObject({
            api: {},
            selectedSessionId: 'session-1',
        })
        expect(catchupSyncCalls.at(-1)).toEqual({ silent: true })
    })

    it('runs authoritative recovery as soon as the page becomes visible again', async () => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        })

        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        expect(runRealtimeRecoveryMock).not.toHaveBeenCalled()

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'))
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock.mock.calls.length).toBeGreaterThanOrEqual(1)
        expect(runRealtimeRecoveryMock.mock.calls.at(-1)?.[0]).toMatchObject({
            api: {},
            selectedSessionId: 'session-1',
        })
        expect(catchupSyncCalls.at(-1)).toEqual({ silent: true })
    })

    it('runs authoritative recovery when a visible page resumes from the browser lifecycle owner', async () => {
        render(<AppRealtimeRuntime api={{} as never} token="token" baseUrl="https://app.viby.run" />)

        expect(runRealtimeRecoveryMock).not.toHaveBeenCalled()

        await act(async () => {
            document.dispatchEvent(new Event('resume'))
            await Promise.resolve()
        })

        expect(runRealtimeRecoveryMock.mock.calls.length).toBeGreaterThanOrEqual(1)
        expect(runRealtimeRecoveryMock.mock.calls.at(-1)?.[0]).toMatchObject({
            api: {},
            selectedSessionId: 'session-1',
        })
        expect(catchupSyncCalls.at(-1)).toEqual({ silent: true })
    })
})
