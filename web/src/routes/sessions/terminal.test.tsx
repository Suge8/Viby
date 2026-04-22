import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { TERMINAL_SURFACE_INTERACTIVE_TEST_ID } from '@/lib/sessionUiContracts'
import TerminalPage from './terminal'

const writeMock = vi.fn()
const terminalSocketMock = vi.hoisted(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onExitHandler: null as ((code: number | null, signal: string | null) => void) | null,
    onExitRegistrar: vi.fn((handler: (code: number | null, signal: string | null) => void) => {
        terminalSocketMock.onExitHandler = handler
    }),
    onOutputHandler: null as ((data: string) => void) | null,
    onOutputRegistrar: vi.fn((handler: (data: string) => void) => {
        terminalSocketMock.onOutputHandler = handler
    }),
    resize: vi.fn(),
    state: { status: 'connected' as const },
}))

vi.mock('@tanstack/react-router', () => ({
    useParams: () => ({ sessionId: 'session-1' }),
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: null,
        token: 'test-token',
        baseUrl: 'http://localhost:3000',
    }),
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => vi.fn(),
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: () => ({
        session: {
            id: 'session-1',
            active: true,
            metadata: { path: '/tmp/project' },
        },
    }),
}))

vi.mock('@/hooks/useTerminalSocket', () => ({
    useTerminalSocket: () => ({
        state: terminalSocketMock.state,
        connect: terminalSocketMock.connect,
        write: writeMock,
        resize: terminalSocketMock.resize,
        disconnect: terminalSocketMock.disconnect,
        onOutput: terminalSocketMock.onOutputRegistrar,
        onExit: terminalSocketMock.onExitRegistrar,
    }),
}))

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick: () => void }) => ({
        onClick,
        onPointerCancel: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerLeave: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onContextMenu: vi.fn(),
    }),
}))

vi.mock('@/components/Terminal/TerminalView', () => ({
    TerminalView: () => <div data-testid="terminal-view" />,
}))

function renderWithProviders() {
    return render(
        <I18nProvider>
            <TerminalPage />
        </I18nProvider>
    )
}

function getPrimaryPasteButton(): HTMLButtonElement {
    return screen.getAllByRole('button', { name: /^(button\.paste|Paste)$/i })[0] as HTMLButtonElement
}

describe('TerminalPage paste behavior', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        terminalSocketMock.onExitHandler = null
        terminalSocketMock.onOutputHandler = null
        terminalSocketMock.state = { status: 'connected' as const }
    })

    it('does not open manual paste dialog when clipboard text is empty', async () => {
        const readText = vi.fn(async () => '')
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText },
        })

        renderWithProviders()
        fireEvent.click(getPrimaryPasteButton())

        await waitFor(() => {
            expect(readText).toHaveBeenCalledTimes(1)
        })
        expect(writeMock).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens manual paste dialog when clipboard read fails', async () => {
        const readText = vi.fn(async () => {
            throw new Error('blocked')
        })
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText },
        })

        renderWithProviders()
        fireEvent.click(getPrimaryPasteButton())

        expect(await screen.findByRole('dialog')).toBeInTheDocument()
    })

    it('keeps a pending surface visible until terminal content arrives', async () => {
        renderWithProviders()

        expect(screen.getAllByTestId('terminal-surface-pending')).toHaveLength(1)
        expect(screen.queryByTestId(TERMINAL_SURFACE_INTERACTIVE_TEST_ID)).toBeNull()

        await waitFor(() => {
            expect(terminalSocketMock.onOutputHandler).not.toBeNull()
        })

        act(() => {
            terminalSocketMock.onOutputHandler?.('prompt ready')
        })

        await waitFor(() => {
            expect(screen.queryByTestId('terminal-surface-pending')).toBeNull()
        })
        expect(screen.getByTestId(TERMINAL_SURFACE_INTERACTIVE_TEST_ID)).toBeInTheDocument()
    })
})
