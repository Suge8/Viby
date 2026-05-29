import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppFloatingNoticeLayer } from '@/components/AppFloatingNoticeLayer'
import { NoticeProvider, useNoticeCenter } from '@/lib/notice-center'
import { NEW_SESSION_ROUTE } from '@/routes/sessions/sessionRoutePaths'

const useRuntimeMock = vi.fn()
const useOnlineStatusMock = vi.fn()
const useRuntimeUpdateStateMock = vi.fn()
const useLocationMock = vi.fn()
const translate = vi.hoisted(
    () => (key: string, values?: Record<string, unknown>) =>
        key === 'runtime.unavailable.lastError' ? `runtime.unavailable.lastError:${String(values?.error ?? '')}` : key
)

vi.mock('@tanstack/react-router', () => ({
    useLocation: (...args: unknown[]) => useLocationMock(...args),
}))

vi.mock('@/hooks/queries/useRuntime', () => ({
    useRuntime: (...args: unknown[]) => useRuntimeMock(...args),
}))

vi.mock('@/hooks/useOnlineStatus', () => ({
    useOnlineStatus: () => useOnlineStatusMock(),
}))

vi.mock('@/hooks/useRuntimeUpdateState', () => ({
    useRuntimeUpdateState: () => useRuntimeUpdateStateMock(),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({ t: translate }),
}))

function renderWithNotices(node: ReactNode) {
    return render(
        <NoticeProvider>
            {node}
            <NoticeProbe />
        </NoticeProvider>
    )
}

function NoticeProbe() {
    const { notices } = useNoticeCenter()
    return (
        <div>
            {notices.map((notice) => (
                <div key={notice.id}>
                    <span>{notice.title}</span>
                    {notice.description ? <span>{notice.description}</span> : null}
                    {notice.action}
                </div>
            ))}
        </div>
    )
}

describe('AppFloatingNoticeLayer', () => {
    afterEach(() => {
        cleanup()
    })

    it('publishes one compact runtime notice when the local runtime is unavailable', () => {
        useLocationMock.mockReturnValue('/sessions')
        useRuntimeMock.mockReturnValue({
            runtime: {
                id: 'runtime-1',
                active: false,
                metadata: null,
                runnerState: {
                    lastSpawnError: {
                        message: 'spawn failed',
                        at: Date.UTC(2026, 3, 9, 18, 0, 0),
                    },
                },
            },
            isLoading: false,
            error: null,
        })
        useOnlineStatusMock.mockReturnValue(true)
        useRuntimeUpdateStateMock.mockReturnValue({
            snapshot: null,
            applyUpdate: async () => true,
        })

        renderWithNotices(<AppFloatingNoticeLayer api={{} as never} banner={{ kind: 'hidden' }} />)

        expect(screen.getByText('runtime.unavailable.title')).toBeInTheDocument()
        expect(screen.getByText(/runtime\.unavailable\.lastError:spawn failed/)).toBeInTheDocument()
    })

    it('uses the load-runtime preset title when there is no runtime snapshot and the fetch failed', () => {
        useLocationMock.mockReturnValue('/sessions')
        useRuntimeMock.mockReturnValue({
            runtime: null,
            isLoading: false,
            error: 'runtime query failed',
        })
        useOnlineStatusMock.mockReturnValue(true)
        useRuntimeUpdateStateMock.mockReturnValue({
            snapshot: null,
            applyUpdate: async () => true,
        })

        renderWithNotices(<AppFloatingNoticeLayer api={{} as never} banner={{ kind: 'hidden' }} />)

        expect(screen.getByText('newSession.error.loadRuntimeTitle')).toBeInTheDocument()
        expect(screen.getByText('runtime query failed')).toBeInTheDocument()
    })

    it('publishes pending runtime updates with an explicit refresh action', () => {
        const applyUpdate = vi.fn(async () => true)
        useLocationMock.mockReturnValue('/sessions')
        useRuntimeMock.mockReturnValue({
            runtime: { id: 'runtime-1', active: true, metadata: null },
            isLoading: false,
            error: null,
        })
        useOnlineStatusMock.mockReturnValue(true)
        useRuntimeUpdateStateMock.mockReturnValue({
            snapshot: { availableAt: 1, mode: 'reload' },
            applyUpdate,
        })

        renderWithNotices(<AppFloatingNoticeLayer api={{} as never} banner={{ kind: 'hidden' }} />)

        expect(screen.getByText('updateReady.title')).toBeInTheDocument()
        expect(screen.getByText('updateReady.action')).toBeInTheDocument()
        expect(applyUpdate).not.toHaveBeenCalled()
    })

    it('suppresses the floating runtime unavailable notice on the new-session route', () => {
        useLocationMock.mockReturnValue(NEW_SESSION_ROUTE)
        useRuntimeMock.mockReturnValue({
            runtime: {
                id: 'runtime-1',
                active: false,
                metadata: null,
                runnerState: {
                    lastSpawnError: {
                        message: 'spawn failed',
                        at: Date.UTC(2026, 3, 9, 18, 0, 0),
                    },
                },
            },
            isLoading: false,
            error: null,
        })
        useOnlineStatusMock.mockReturnValue(true)
        useRuntimeUpdateStateMock.mockReturnValue({
            snapshot: null,
            applyUpdate: async () => true,
        })

        renderWithNotices(<AppFloatingNoticeLayer api={{} as never} banner={{ kind: 'hidden' }} />)

        expect(screen.queryByText('runtime.unavailable.title')).not.toBeInTheDocument()
    })
})
