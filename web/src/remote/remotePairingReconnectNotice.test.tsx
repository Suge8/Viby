import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Notice } from '@/lib/notice-center'
import { recordRemotePairingDiagnostic, resetRemotePairingDiagnosticsForTests } from './remotePairingDiagnostics'
import { useRemoteReconnectNotice } from './remotePairingReconnectNotice'

const noticeState = vi.hoisted(() => ({ notice: null as Notice | null, addToast: vi.fn() }))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({ addToast: noticeState.addToast }),
    usePersistentNotice: (notice: Notice | null) => {
        noticeState.notice = notice
    },
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}))

function NoticeHarness(): null {
    useRemoteReconnectNotice({ reconnect: { attempt: 1, tone: 'warning' } })
    return null
}

describe('useRemoteReconnectNotice', () => {
    beforeEach(() => {
        noticeState.notice = null
        noticeState.addToast.mockClear()
        resetRemotePairingDiagnosticsForTests()
        window.history.replaceState(null, '', '/sessions?debug=pairing')
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText: vi.fn(async () => undefined) },
        })
    })

    it('copies debug diagnostics and confirms with one toast', async () => {
        recordRemotePairingDiagnostic('rpc-failure', { route: 'relay' })
        render(<NoticeHarness />)
        render(<>{noticeState.notice?.action}</>)

        fireEvent.click(screen.getByRole('button', { name: 'remotePairing.reconnectNotice.copyDiagnostics' }))

        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('rpc-failure'))
        )
        expect(noticeState.addToast).toHaveBeenCalledWith({
            title: 'remotePairing.reconnectNotice.copyDiagnosticsSuccess',
            tone: 'success',
            compact: true,
        })
    })
})
