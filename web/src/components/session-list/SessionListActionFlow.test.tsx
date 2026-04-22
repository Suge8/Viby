import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from '@/components/SessionList'
import { I18nProvider } from '@/lib/i18n-context'
import { TEST_PROJECT_PATH } from '@/test/sessionFactories'
import type { SessionSummary } from '@/types/api'

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation(() => ({
            matches: false,
            media: '(min-width: 1024px)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: (options: { onClick?: () => void; onLongPress?: (point: { x: number; y: number }) => void }) => ({
        onClick: options.onClick,
        onPointerCancel: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerLeave: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onContextMenu: (event: { clientX?: number; clientY?: number }) => {
            options.onLongPress?.({
                x: event.clientX ?? 0,
                y: event.clientY ?? 0,
            })
        },
    }),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
    }),
}))

const stopSessionMock = vi.fn(async () => {})
const deleteSessionMock = vi.fn(async () => {})

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        stopSession: stopSessionMock,
        renameSession: vi.fn(),
        deleteSession: deleteSessionMock,
        isPending: false,
    }),
}))

vi.mock('@/components/SessionActionMenu', () => ({
    SessionActionMenu: ({
        overlay,
        onActionSelect,
    }: {
        overlay: { isOpen: boolean }
        onActionSelect: (actionId: 'rename' | 'stop' | 'delete') => void
    }) => {
        if (!overlay.isOpen) {
            return null
        }

        return (
            <>
                <button type="button" onClick={() => onActionSelect('rename')}>
                    rename-action
                </button>
                <button type="button" onClick={() => onActionSelect('stop')}>
                    stop-action
                </button>
                <button type="button" onClick={() => onActionSelect('delete')}>
                    delete-action
                </button>
            </>
        )
    },
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: ({ isOpen }: { isOpen: boolean }) => {
        if (!isOpen) {
            return null
        }

        return <div>rename-dialog-open</div>
    },
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: ({ dialog }: { dialog: { isOpen: boolean } }) => {
        if (!dialog.isOpen) {
            return null
        }

        return <div>confirm-dialog-open</div>
    },
}))

function createSessionSummary(): SessionSummary {
    const now = Date.now()

    return {
        id: 'session-closed',
        active: false,
        thinking: false,
        activeAt: now,
        updatedAt: now,
        latestActivityAt: now,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: now,
        lifecycleState: 'closed',
        lifecycleStateSince: now,
        metadata: {
            path: TEST_PROJECT_PATH,
            driver: 'codex',
            summary: { text: 'Needs review', updatedAt: now },
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        resumeStrategy: 'none',
        model: null,
        modelReasoningEffort: null,
    }
}

function renderSessionList(onSelect: (sessionId: string) => void = vi.fn()): void {
    render(
        <I18nProvider>
            <SessionList
                sessions={[createSessionSummary()]}
                api={null}
                selectedSessionId={null}
                actions={{
                    onSelect,
                    onNewSession: vi.fn(),
                }}
            />
        </I18nProvider>
    )
}

describe('SessionList action flow', () => {
    afterEach(() => {
        cleanup()
        stopSessionMock.mockClear()
        deleteSessionMock.mockClear()
    })

    it('keeps the action controller mounted long enough to open the stop confirm dialog', async () => {
        renderSessionList()

        fireEvent.contextMenu(screen.getByRole('button', { name: /needs review/i }), {
            clientX: 24,
            clientY: 36,
        })

        fireEvent.click(await screen.findByRole('button', { name: 'stop-action' }))

        expect(screen.getByText('confirm-dialog-open')).toBeInTheDocument()
        expect(stopSessionMock).not.toHaveBeenCalled()
    })

    it('keeps the action controller mounted long enough to open the rename dialog on the first click', async () => {
        renderSessionList()

        fireEvent.contextMenu(screen.getByRole('button', { name: /needs review/i }), {
            clientX: 24,
            clientY: 36,
        })

        fireEvent.click(await screen.findByRole('button', { name: 'rename-action' }))

        expect(screen.getByText('rename-dialog-open')).toBeInTheDocument()
        expect(stopSessionMock).not.toHaveBeenCalled()
    })

    it('keeps the action controller mounted long enough to open the delete confirm dialog', async () => {
        renderSessionList()

        fireEvent.contextMenu(screen.getByRole('button', { name: /needs review/i }), {
            clientX: 24,
            clientY: 36,
        })

        fireEvent.click(await screen.findByRole('button', { name: 'delete-action' }))

        expect(screen.getByText('confirm-dialog-open')).toBeInTheDocument()
        expect(deleteSessionMock).not.toHaveBeenCalled()
    })
})
