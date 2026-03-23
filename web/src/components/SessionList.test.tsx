import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import type { SessionSummary } from '@/types/api'
import { SessionList } from './SessionList'

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick: () => void }) => ({
        onClick,
        onPointerCancel: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerLeave: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onContextMenu: vi.fn()
    })
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        }
    })
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        archiveSession: vi.fn(),
        closeSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        resumeSession: vi.fn(),
        unarchiveSession: vi.fn(),
        isPending: false,
    })
}))

vi.mock('@/components/SessionActionMenu', () => ({
    SessionActionMenu: () => null
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: () => null
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: () => null
}))

function renderSessionList({
    selectedSessionId = null
}: {
    selectedSessionId?: string | null
} = {}) {
    const now = Date.now()

    return render(
        <I18nProvider>
            <SessionList
                sessions={[
                    createSessionSummary({
                        id: 'session-1',
                        active: true,
                        thinking: true,
                        activeAt: now,
                        updatedAt: now,
                        latestActivityAt: now,
                        latestActivityKind: 'reply',
                        latestCompletedReplyAt: null,
                        lifecycleState: 'running',
                        lifecycleStateSince: now,
                        metadata: {
                            path: '/Users/sugeh/Project/Bao',
                            flavor: 'codex',
                            summary: { text: 'Bao summary', updatedAt: now }
                        },
                        model: 'gpt-5.4-mini',
                        modelReasoningEffort: 'high'
                    }),
                    createSessionSummary({
                        id: 'session-2',
                        lifecycleState: 'closed',
                        lifecycleStateSince: now - 1000,
                        updatedAt: now - 1000,
                        latestActivityAt: now - 1000,
                        latestActivityKind: 'ready',
                        latestCompletedReplyAt: now - 1000,
                        metadata: {
                            path: '/Users/sugeh/Project/Viby',
                            flavor: 'claude',
                            summary: { text: 'Needs review', updatedAt: now - 1000 }
                        }
                    }),
                    createSessionSummary({
                        id: 'session-3',
                        lifecycleState: 'archived',
                        lifecycleStateSince: now - 2000,
                        updatedAt: now - 2000,
                        latestActivityAt: now - 2000,
                        latestActivityKind: 'ready',
                        latestCompletedReplyAt: now - 2000,
                        metadata: {
                            path: '/Users/sugeh/Project/Viby',
                            flavor: 'claude',
                            summary: { text: 'Archived summary', updatedAt: now - 2000 }
                        }
                    })
                ]}
                renderHeader={false}
                api={null}
                selectedSessionId={selectedSessionId}
                actions={{
                    onSelect: vi.fn(),
                    onNewSession: vi.fn()
                }}
            />
        </I18nProvider>
    )
}

function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    const {
        id,
        latestActivityAt = 0,
        latestActivityKind = 'ready',
        latestCompletedReplyAt = 0,
        ...restOverrides
    } = overrides

    return {
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
        lifecycleState: 'closed',
        lifecycleStateSince: null,
        metadata: {
            path: '/Users/sugeh/Project/Viby',
            flavor: 'codex',
            summary: { text: 'Summary', updatedAt: 0 }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        modelReasoningEffort: null,
        ...restOverrides,
        id
    }
}

describe('SessionList', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        window.localStorage.clear()
        document.body.innerHTML = ''
    })

    it('shows sessions and archived tabs with the updated state language', () => {
        renderSessionList()

        expect(screen.getByText('Sessions')).toBeInTheDocument()
        expect(screen.getByText('Archived')).toBeInTheDocument()
        expect(screen.getByText('Active')).toBeInTheDocument()
        expect(screen.getByText('Working')).toBeInTheDocument()
        expect(screen.getByText('Closed')).toBeInTheDocument()
        expect(screen.queryByText('GPT-5.4 Mini')).not.toBeInTheDocument()
        expect(screen.queryByText('High')).not.toBeInTheDocument()
        expect(screen.queryByText(/model:/i)).not.toBeInTheDocument()
        expect(screen.getByText('Bao summary')).toBeInTheDocument()
        expect(screen.queryByTitle('Reply')).not.toBeInTheDocument()
    })

    it('renders session cards without the legacy border shell', () => {
        renderSessionList()

        const workingCard = screen.getByText('Bao summary').closest('button')

        expect(workingCard).not.toBeNull()
        expect(workingCard?.className).not.toMatch(/\bborder\b/)
    })

    it('shows a new reply indicator only for sessions whose activity is newer than the stored seen timestamp', () => {
        const now = Date.now()
        window.localStorage.setItem('viby:session-attention', JSON.stringify({
            'session-2': now - 60_000,
        }))

        renderSessionList()

        expect(screen.getByTitle('Reply')).toBeInTheDocument()
    })

    it('does not treat a non-message session update as a new reply', () => {
        const now = Date.now()
        window.localStorage.setItem('viby:session-attention', JSON.stringify({
            'session-2': now - 500,
        }))

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-2',
                            lifecycleState: 'closed',
                            lifecycleStateSince: now - 1000,
                            updatedAt: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Needs review', updatedAt: now - 500 }
                            }
                        })
                    ]}
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

        expect(screen.queryByTitle('Reply')).not.toBeInTheDocument()
    })

    it('keeps a running session in working state until a ready event arrives', () => {
        const now = Date.now()

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-running',
                            active: true,
                            thinking: false,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            lifecycleState: 'running',
                            lifecycleStateSince: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Streaming reply', updatedAt: now }
                            }
                        })
                    ]}
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

        expect(screen.getByText('Working')).toBeInTheDocument()
        expect(screen.queryByText('Awaiting input')).not.toBeInTheDocument()
    })

    it('shows new reply only after the turn reaches ready state', () => {
        const now = Date.now()
        window.localStorage.setItem('viby:session-attention', JSON.stringify({
            'session-ready': now - 60_000,
            'session-streaming': now - 60_000,
        }))

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-streaming',
                            active: true,
                            thinking: false,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            lifecycleState: 'running',
                            lifecycleStateSince: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Still streaming', updatedAt: now }
                            }
                        }),
                        createSessionSummary({
                            id: 'session-ready',
                            active: true,
                            thinking: false,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now,
                            lifecycleState: 'running',
                            lifecycleStateSince: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'codex',
                                summary: { text: 'Ready reply', updatedAt: now }
                            }
                        })
                    ]}
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

        expect(screen.getAllByTitle('Reply')).toHaveLength(1)
    })

    it('keeps streaming sessions below newer stable sessions until completion', () => {
        const now = Date.now()

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-streaming',
                            active: true,
                            thinking: false,
                            updatedAt: now - 1_000,
                            latestActivityAt: now,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            lifecycleState: 'running',
                            lifecycleStateSince: now - 1_000,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Streaming session', updatedAt: now }
                            }
                        }),
                        createSessionSummary({
                            id: 'session-stable',
                            active: true,
                            thinking: false,
                            updatedAt: now - 100,
                            latestActivityAt: now - 100,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now - 100,
                            lifecycleState: 'running',
                            lifecycleStateSince: now - 100,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'codex',
                                summary: { text: 'Stable session', updatedAt: now - 100 }
                            }
                        })
                    ]}
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

        const stableCard = screen.getByText('Stable session').closest('button')
        const streamingCard = screen.getByText('Streaming session').closest('button')

        expect(stableCard).not.toBeNull()
        expect(streamingCard).not.toBeNull()
        expect(stableCard?.compareDocumentPosition(streamingCard as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('keeps awaiting-input sessions below newer stable sessions until a final reply advances updatedAt', () => {
        const now = Date.now()

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-awaiting-input',
                            active: true,
                            thinking: false,
                            updatedAt: now + 5_000,
                            latestActivityAt: now - 1_000,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now - 1_000,
                            lifecycleState: 'running',
                            lifecycleStateSince: now - 1_000,
                            pendingRequestsCount: 1,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'codex',
                                summary: { text: 'Awaiting approval', updatedAt: now - 1_000 }
                            }
                        }),
                        createSessionSummary({
                            id: 'session-stable',
                            active: true,
                            thinking: false,
                            updatedAt: now - 100,
                            latestActivityAt: now - 100,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now - 100,
                            lifecycleState: 'running',
                            lifecycleStateSince: now - 100,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Stable session', updatedAt: now - 100 }
                            }
                        })
                    ]}
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

        const stableCard = screen.getByText('Stable session').closest('button')
        const awaitingInputCard = screen.getByText('Awaiting approval').closest('button')

        expect(stableCard).not.toBeNull()
        expect(awaitingInputCard).not.toBeNull()
        expect(stableCard?.compareDocumentPosition(awaitingInputCard as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
})
