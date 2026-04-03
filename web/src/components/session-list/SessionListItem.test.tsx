import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionListItem } from './SessionListItem'

const NOW = 1_742_895_600_000

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
        },
    })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn()
        }
    })
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string | number>) => {
            switch (key) {
                case 'session.more':
                    return 'More actions'
                case 'session.team.managerSource':
                    return `Manager: ${values?.manager ?? 'Manager'}`
                case 'session.team.control.manager':
                    return 'Manager control'
                case 'session.team.control.user':
                    return 'User takeover'
                case 'session.team.membership.active':
                    return 'Active member'
                case 'session.team.membership.archived':
                    return 'Archived member'
                case 'session.team.membership.removed':
                    return 'Removed member'
                case 'session.team.membership.superseded':
                    return 'Superseded member'
                case 'session.time.justNow':
                    return 'Just now'
                case 'session.state.processing':
                    return 'Working'
                case 'session.state.awaitingInput':
                    return 'Awaiting input'
                case 'session.state.closed':
                    return 'Closed'
                case 'session.state.archived':
                    return 'Archived'
                case 'session.attention.newReply':
                    return 'Reply'
                default:
                    return key
            }
        }
    })
}))

function renderItem(selectionOverrides?: Partial<{
    onPreload: (sessionId: string) => void
    onSelect: (sessionId: string) => void
    onOpenActionMenu: (sessionId: string, point: { x: number; y: number }) => void
    session: Record<string, unknown>
}>): void {
    const session = {
        id: 'session-1',
        active: true,
        thinking: false,
        activeAt: NOW,
        updatedAt: NOW,
        latestActivityAt: NOW,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: NOW,
        lifecycleState: 'running',
        lifecycleStateSince: NOW,
        metadata: {
            path: '/Users/sugeh/Project/Viby',
            driver: 'codex',
            name: 'session-1'
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: true,
        model: 'gpt-5.4',
        modelReasoningEffort: 'xhigh',
        ...selectionOverrides?.session
    }

    render(
        <I18nProvider>
            <SessionListItem
                session={session as never}
                hasUnseenReply={false}
                selection={{
                    onSelect: selectionOverrides?.onSelect ?? vi.fn(),
                    onPreload: selectionOverrides?.onPreload,
                    selectedSessionId: null
                }}
                onOpenActionMenu={selectionOverrides?.onOpenActionMenu}
            />
        </I18nProvider>
    )
}

function getSessionButton(): HTMLElement {
    return screen.getByRole('button', { name: /session-1/i })
}

describe('SessionListItem', () => {
    afterEach(() => {
        cleanup()
    })

    it('preloads the session route when the card receives focus', () => {
        const onPreload = vi.fn()
        renderItem({ onPreload })

        fireEvent.focus(getSessionButton())

        expect(onPreload).toHaveBeenCalledWith('session-1')
    })

    it('preloads the session route on touch pointer down so mobile taps get a head start', () => {
        const onPreload = vi.fn()
        renderItem({ onPreload })

        fireEvent.pointerDown(getSessionButton(), { pointerType: 'touch' })

        expect(onPreload).toHaveBeenCalledWith('session-1')
    })

    it('marks the card as a direct-manipulation tap target on mobile', () => {
        renderItem()

        expect((getSessionButton() as HTMLButtonElement).style.touchAction).toBe('manipulation')
    })

    it('renders the session card through the shared card press primitive', () => {
        renderItem()

        const button = getSessionButton()

        expect(button).toHaveAttribute('data-button-press-style', 'card')
        expect(button).toHaveAttribute('data-button-pointer-effect', 'none')
    })

    it('forwards long-press action intent to the shared list-level owner', () => {
        const onOpenActionMenu = vi.fn()
        renderItem({ onOpenActionMenu })

        fireEvent.contextMenu(getSessionButton(), { clientX: 20, clientY: 24 })

        expect(onOpenActionMenu).toHaveBeenCalledWith('session-1', { x: 20, y: 24 })
    })

    it('only keeps the compact project metadata row under the title', () => {
        renderItem()

        expect(screen.getByText('Project/Viby')).toBeInTheDocument()
        expect(screen.queryByText('GPT-5.4')).not.toBeInTheDocument()
        expect(screen.queryByText('XHigh')).not.toBeInTheDocument()
    })

    it('uses the stable member title and concise team chips for manager-owned member rows', () => {
        renderItem({
            session: {
                metadata: {
                    path: '/Users/sugeh/Project/Viby',
                    driver: 'claude',
                    summary: { text: 'Implement API', updatedAt: NOW }
                },
                team: {
                    projectId: 'project-1',
                    sessionRole: 'member',
                    managerSessionId: 'manager-1',
                    managerTitle: 'Manager Alpha',
                    memberRole: 'implementer',
                    memberRoleName: 'Mobile Reviewer',
                    memberRevision: 2,
                    controlOwner: 'manager',
                    membershipState: 'active',
                    projectStatus: 'active',
                    activeMemberCount: 2,
                    archivedMemberCount: 0,
                    runningMemberCount: 1,
                    blockedTaskCount: 0
                }
            }
        })

        expect(screen.getByText('Mobile Reviewer · r2')).toBeInTheDocument()
        expect(screen.queryByText('implementer · r2')).not.toBeInTheDocument()
        expect(screen.getByText('Manager: Manager Alpha')).toBeInTheDocument()
        expect(screen.getByText('Active member')).toBeInTheDocument()
        expect(screen.getByText('Manager control')).toBeInTheDocument()
        expect(screen.queryByText('Implement API')).not.toBeInTheDocument()
    })
})
