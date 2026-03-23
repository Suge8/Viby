import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import type { SessionSummary } from '@/types/api'
import { SessionList } from '@/components/SessionList'

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
                y: event.clientY ?? 0
            })
        }
    })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn()
        }
    })
}))

const archiveSessionMock = vi.fn(async () => {})

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: archiveSessionMock,
        closeSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        resumeSession: vi.fn(async () => 'session-closed'),
        unarchiveSession: vi.fn(),
        isPending: false
    })
}))

vi.mock('@/components/SessionActionMenu', () => ({
    SessionActionMenu: ({
        isOpen,
        actions
    }: {
        isOpen: boolean
        actions: {
            onArchive: () => void
        }
    }) => {
        if (!isOpen) {
            return null
        }

        return (
            <button type="button" onClick={actions.onArchive}>
                archive-action
            </button>
        )
    }
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: () => null
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: ({ isOpen }: { isOpen: boolean }) => {
        if (!isOpen) {
            return null
        }

        return <div>confirm-dialog-open</div>
    }
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
            path: '/Users/sugeh/Project/Viby',
            flavor: 'codex',
            summary: { text: 'Needs review', updatedAt: now }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        modelReasoningEffort: null
    }
}

describe('SessionList action flow', () => {
    afterEach(() => {
        cleanup()
        archiveSessionMock.mockClear()
    })

    it('keeps the action controller mounted long enough to open the archive confirm dialog', async () => {
        render(
            <I18nProvider>
                <SessionList
                    sessions={[createSessionSummary()]}
                    renderHeader={false}
                    api={null}
                    selectedSessionId={null}
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        fireEvent.contextMenu(screen.getByRole('button', { name: /needs review/i }), {
            clientX: 24,
            clientY: 36
        })

        fireEvent.click(await screen.findByRole('button', { name: 'archive-action' }))

        expect(screen.getByText('confirm-dialog-open')).toBeInTheDocument()
        expect(archiveSessionMock).not.toHaveBeenCalled()
    })
})
