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

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string | number>) => {
            if (key === 'sessions.summary' && values) {
                return `${values.open}/${values.archived}`
            }

            switch (key) {
                case 'sessions.tab.sessions':
                    return 'Sessions'
                case 'sessions.tab.archived':
                    return 'Archived'
                case 'sessions.section.running':
                    return 'Active'
                case 'sessions.section.recentlyClosed':
                    return 'Closed'
                case 'sessions.section.earlier':
                    return 'Earlier'
                case 'sessions.group.team':
                    return 'Team'
                case 'sessions.group.project.active':
                    return 'Project active'
                case 'sessions.group.project.delivered':
                    return 'Project delivered'
                case 'sessions.group.project.archived':
                    return 'Project archived'
                case 'sessions.group.activeMembers':
                    return `${values?.count ?? 0} active`
                case 'sessions.group.runningMembers':
                    return `${values?.count ?? 0} running`
                case 'sessions.group.blockedTasks':
                    return `${values?.count ?? 0} blocked`
                case 'sessions.group.archivedMembers':
                    return `${values?.count ?? 0} history`
                case 'sessions.group.showMembers':
                    return `Show ${values?.count ?? 0} members`
                case 'sessions.group.hideMembers':
                    return 'Hide members'
                case 'sessions.empty.sessions':
                    return 'No sessions'
                case 'sessions.empty.archived':
                    return 'No archived sessions'
                case 'sessions.new':
                    return 'New Session'
                case 'session.attention.newReply':
                    return 'Reply'
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
                case 'session.state.processing':
                    return 'Working'
                case 'session.state.awaitingInput':
                    return 'Awaiting input'
                case 'session.state.closed':
                    return 'Closed'
                case 'session.state.archived':
                    return 'Archived'
                case 'session.more':
                    return 'More actions'
                case 'session.time.justNow':
                    return 'Just now'
                default:
                    return key
            }
        }
    })
}))

function renderSessionList({
    selectedSessionId = null,
    sessions
}: {
    selectedSessionId?: string | null
    sessions?: SessionSummary[]
} = {}) {
    const now = Date.now()
    const renderedSessions = sessions ?? [
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
    ]

    return render(
        <I18nProvider>
            <SessionList
                sessions={renderedSessions}
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
        resumeAvailable: false,
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
        expect(screen.getAllByText('Closed').length).toBeGreaterThan(0)
        expect(screen.getByRole('button', { name: 'New Session' })).toBeInTheDocument()
        expect(screen.queryByText('GPT-5.4 Mini')).not.toBeInTheDocument()
        expect(screen.queryByText('High')).not.toBeInTheDocument()
        expect(screen.queryByText(/model:/i)).not.toBeInTheDocument()
        expect(screen.getByText('Bao summary')).toBeInTheDocument()
        expect(screen.queryByTitle('Reply')).not.toBeInTheDocument()
    })

    it('keeps the sessions tab when the selected session becomes archived later', () => {
        const now = Date.now()
        const { rerender } = renderSessionList({
            selectedSessionId: 'session-2',
            sessions: [
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
                    }
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
            ]
        })

        rerender(
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
                            }
                        }),
                        createSessionSummary({
                            id: 'session-2',
                            lifecycleState: 'archived',
                            lifecycleStateSince: now,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Needs review', updatedAt: now }
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
                    api={null}
                    selectedSessionId="session-2"
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Bao summary')).toBeInTheDocument()
        expect(screen.queryByText('Archived summary')).not.toBeInTheDocument()
    })

    it('returns from archived to sessions when the selected session is restored', () => {
        const now = Date.now()
        const { rerender } = renderSessionList({
            selectedSessionId: 'session-3',
            sessions: [
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
            ]
        })

        expect(screen.getByText('Archived summary')).toBeInTheDocument()

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-3',
                            lifecycleState: 'closed',
                            lifecycleStateSince: now,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'claude',
                                summary: { text: 'Archived summary', updatedAt: now }
                            }
                        })
                    ]}
                    api={null}
                    selectedSessionId="session-3"
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Archived summary')).toBeInTheDocument()
        expect(screen.queryByText('No archived sessions')).not.toBeInTheDocument()
    })

    it('switches to the archived tab when route selection changes to an archived session', () => {
        const now = Date.now()
        const sessions = [
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
        ]
        const { rerender } = renderSessionList({
            selectedSessionId: 'session-1',
            sessions
        })

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={sessions}
                    api={null}
                    selectedSessionId="session-3"
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Archived summary')).toBeInTheDocument()
        expect(screen.queryByText('Bao summary')).not.toBeInTheDocument()
    })

    it('renders session cards without the legacy border shell', () => {
        renderSessionList()

        const workingCard = screen.getByText('Bao summary').closest('button')

        expect(workingCard).not.toBeNull()
        expect(workingCard?.className).not.toMatch(/\bborder-\[/)
    })

    it('folds member sessions under their manager row and expands on demand', async () => {
        const now = Date.now()

        renderSessionList({
            sessions: [
                createSessionSummary({
                    id: 'manager-1',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'codex',
                        summary: { text: 'Manager Alpha', updatedAt: now }
                    },
                    team: {
                        projectId: 'project-1',
                        sessionRole: 'manager',
                        managerSessionId: 'manager-1',
                        managerTitle: 'Manager Alpha',
                        projectStatus: 'active',
                        activeMemberCount: 2,
                        archivedMemberCount: 1,
                        runningMemberCount: 1,
                        blockedTaskCount: 1
                    }
                }),
                createSessionSummary({
                    id: 'member-1',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now - 1_000,
                    latestActivityAt: now - 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: now - 1_000,
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'claude',
                        summary: { text: 'Implement API', updatedAt: now - 1_000 }
                    },
                    team: {
                        projectId: 'project-1',
                        sessionRole: 'member',
                        managerSessionId: 'manager-1',
                        managerTitle: 'Manager Alpha',
                        memberRole: 'implementer',
                        memberRoleName: 'Mobile Implementer',
                        memberRevision: 1,
                        membershipState: 'active',
                        controlOwner: 'manager',
                        projectStatus: 'active',
                        activeMemberCount: 2,
                        archivedMemberCount: 1,
                        runningMemberCount: 1,
                        blockedTaskCount: 1
                    }
                }),
                createSessionSummary({
                    id: 'member-2',
                    active: false,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now - 2_000,
                    latestActivityAt: now - 2_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 2_000,
                    lifecycleState: 'closed',
                    lifecycleStateSince: now - 2_000,
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'claude',
                        summary: { text: 'Review patch', updatedAt: now - 2_000 }
                    },
                    team: {
                        projectId: 'project-1',
                        sessionRole: 'member',
                        managerSessionId: 'manager-1',
                        managerTitle: 'Manager Alpha',
                        memberRole: 'reviewer',
                        memberRoleName: 'Release Reviewer',
                        memberRevision: 1,
                        membershipState: 'active',
                        controlOwner: 'manager',
                        projectStatus: 'active',
                        activeMemberCount: 2,
                        archivedMemberCount: 1,
                        runningMemberCount: 1,
                        blockedTaskCount: 1
                    }
                })
            ]
        })

        expect(screen.getByText('Manager Alpha')).toBeInTheDocument()
        expect(screen.getByText('Team')).toBeInTheDocument()
        expect(screen.getByText('2 active')).toBeInTheDocument()
        expect(screen.getByText('1 running')).toBeInTheDocument()
        expect(screen.getByText('1 blocked')).toBeInTheDocument()
        expect(screen.getByText('1 history')).toBeInTheDocument()
        expect(screen.queryByText('Mobile Implementer · r1')).not.toBeInTheDocument()

        screen.getByRole('button', { name: 'Show 2 members' }).click()

        expect(await screen.findByText('Mobile Implementer · r1')).toBeInTheDocument()
        expect(screen.getByText('Release Reviewer · r1')).toBeInTheDocument()
        expect(screen.getAllByText('Manager: Manager Alpha').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Active member').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Manager control').length).toBeGreaterThan(0)
    })

    it('auto-expands the owning manager group when a member session is selected', () => {
        const now = Date.now()

        renderSessionList({
            selectedSessionId: 'member-selected',
            sessions: [
                createSessionSummary({
                    id: 'manager-selected',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'codex',
                        summary: { text: 'Manager Selected', updatedAt: now }
                    },
                    team: {
                        projectId: 'project-selected',
                        sessionRole: 'manager',
                        managerSessionId: 'manager-selected',
                        managerTitle: 'Manager Selected',
                        projectStatus: 'active',
                        activeMemberCount: 1,
                        archivedMemberCount: 0,
                        runningMemberCount: 1,
                        blockedTaskCount: 0
                    }
                }),
                createSessionSummary({
                    id: 'member-selected',
                    active: true,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now - 1_000,
                    latestActivityAt: now - 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: now - 1_000,
                    metadata: {
                        path: '/Users/sugeh/Project/Viby',
                        flavor: 'claude',
                        summary: { text: 'Selected member', updatedAt: now - 1_000 }
                    },
                    team: {
                        projectId: 'project-selected',
                        sessionRole: 'member',
                        managerSessionId: 'manager-selected',
                        managerTitle: 'Manager Selected',
                        memberRole: 'implementer',
                        memberRoleName: 'Mobile Implementer',
                        memberRevision: 1,
                        membershipState: 'active',
                        controlOwner: 'manager',
                        projectStatus: 'active',
                        activeMemberCount: 1,
                        archivedMemberCount: 0,
                        runningMemberCount: 1,
                        blockedTaskCount: 0
                    }
                })
            ]
        })

        expect(screen.getByText('Mobile Implementer · r1')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Show 1 members' })).not.toBeInTheDocument()
    })

    it('folds archived team sessions under their manager row and auto-expands the selected archived member', async () => {
        const now = Date.now()
        const sessions = [
            createSessionSummary({
                id: 'manager-archived',
                active: false,
                thinking: false,
                activeAt: now - 3_000,
                updatedAt: now - 1_000,
                latestActivityAt: now - 1_000,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: now - 1_000,
                lifecycleState: 'archived',
                lifecycleStateSince: now - 1_000,
                metadata: {
                    path: '/Users/sugeh/Project/Viby',
                    flavor: 'codex',
                    summary: { text: 'Archived Manager', updatedAt: now - 1_000 }
                },
                team: {
                    projectId: 'project-archived',
                    sessionRole: 'manager',
                    managerSessionId: 'manager-archived',
                    managerTitle: 'Archived Manager',
                    projectStatus: 'archived',
                    activeMemberCount: 0,
                    archivedMemberCount: 2,
                    runningMemberCount: 0,
                    blockedTaskCount: 0
                }
            }),
            createSessionSummary({
                id: 'member-archived-1',
                active: false,
                thinking: false,
                activeAt: now - 4_000,
                updatedAt: now - 2_000,
                latestActivityAt: now - 2_000,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: now - 2_000,
                lifecycleState: 'archived',
                lifecycleStateSince: now - 2_000,
                metadata: {
                    path: '/Users/sugeh/Project/Viby',
                    flavor: 'claude',
                    summary: { text: 'Archived implementer', updatedAt: now - 2_000 }
                },
                team: {
                    projectId: 'project-archived',
                    sessionRole: 'member',
                    managerSessionId: 'manager-archived',
                    managerTitle: 'Archived Manager',
                    memberRole: 'implementer',
                    memberRoleName: 'Archived Implementer',
                    memberRevision: 1,
                    membershipState: 'archived',
                    controlOwner: 'manager',
                    projectStatus: 'archived',
                    activeMemberCount: 0,
                    archivedMemberCount: 2,
                    runningMemberCount: 0,
                    blockedTaskCount: 0
                }
            }),
            createSessionSummary({
                id: 'member-archived-2',
                active: false,
                thinking: false,
                activeAt: now - 5_000,
                updatedAt: now - 3_000,
                latestActivityAt: now - 3_000,
                latestActivityKind: 'ready',
                latestCompletedReplyAt: now - 3_000,
                lifecycleState: 'archived',
                lifecycleStateSince: now - 3_000,
                metadata: {
                    path: '/Users/sugeh/Project/Viby',
                    flavor: 'claude',
                    summary: { text: 'Archived reviewer', updatedAt: now - 3_000 }
                },
                team: {
                    projectId: 'project-archived',
                    sessionRole: 'member',
                    managerSessionId: 'manager-archived',
                    managerTitle: 'Archived Manager',
                    memberRole: 'reviewer',
                    memberRoleName: 'Archived Reviewer',
                    memberRevision: 1,
                    membershipState: 'archived',
                    controlOwner: 'manager',
                    projectStatus: 'archived',
                    activeMemberCount: 0,
                    archivedMemberCount: 2,
                    runningMemberCount: 0,
                    blockedTaskCount: 0
                }
            })
        ]
        const { rerender } = renderSessionList({
            selectedSessionId: 'manager-archived',
            sessions
        })

        expect(screen.getByText('Archived Manager')).toBeInTheDocument()
        expect(screen.getByText('Project archived')).toBeInTheDocument()
        expect(screen.getByText('2 history')).toBeInTheDocument()
        expect(screen.queryByText('Archived Implementer · r1')).not.toBeInTheDocument()

        screen.getByRole('button', { name: 'Show 2 members' }).click()

        expect(await screen.findByText('Archived Implementer · r1')).toBeInTheDocument()
        expect(await screen.findByText('Archived Reviewer · r1')).toBeInTheDocument()

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={sessions}
                    api={null}
                    selectedSessionId="member-archived-1"
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(await screen.findByText('Archived Implementer · r1')).toBeInTheDocument()
        expect(await screen.findByText('Archived Reviewer · r1')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Show 2 members' })).not.toBeInTheDocument()
    })


    it('rerenders member row title when the authoritative custom role name changes without a timestamp bump', () => {
        const now = Date.now()
        const baseMember = createSessionSummary({
            id: 'member-role-name',
            active: true,
            thinking: false,
            activeAt: now,
            updatedAt: now,
            latestActivityAt: now,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: now,
            lifecycleState: 'running',
            lifecycleStateSince: now,
            metadata: {
                path: '/Users/sugeh/Project/Viby',
                flavor: 'claude',
                summary: { text: 'Old member label', updatedAt: now }
            },
            team: {
                projectId: 'project-role-name',
                sessionRole: 'member',
                managerSessionId: 'manager-role-name',
                managerTitle: 'Manager Role Name',
                memberRole: 'debugger',
                memberRoleName: 'Mobile Debugger',
                memberRevision: 2,
                membershipState: 'active',
                controlOwner: 'manager',
                projectStatus: 'active',
                activeMemberCount: 1,
                archivedMemberCount: 0,
                runningMemberCount: 1,
                blockedTaskCount: 0
            }
        })
        const { rerender } = renderSessionList({ sessions: [baseMember] })

        expect(screen.getByText('Mobile Debugger · r2')).toBeInTheDocument()
        expect(screen.queryByText('Release Debugger · r2')).not.toBeInTheDocument()

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={[{
                        ...baseMember,
                        team: {
                            ...baseMember.team!,
                            memberRoleName: 'Release Debugger'
                        }
                    }]}
                    api={null}
                    selectedSessionId={null}
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Release Debugger · r2')).toBeInTheDocument()
        expect(screen.queryByText('Mobile Debugger · r2')).not.toBeInTheDocument()
    })

    it('rerenders member row presentation when team control metadata changes without a timestamp bump', () => {
        const now = Date.now()
        const baseMember = createSessionSummary({
            id: 'member-rerender',
            active: true,
            thinking: false,
            activeAt: now,
            updatedAt: now,
            latestActivityAt: now,
            latestActivityKind: 'ready',
            latestCompletedReplyAt: now,
            lifecycleState: 'running',
            lifecycleStateSince: now,
            metadata: {
                path: '/Users/sugeh/Project/Viby',
                flavor: 'claude',
                summary: { text: 'Old member label', updatedAt: now }
            },
            team: {
                projectId: 'project-rerender',
                sessionRole: 'member',
                managerSessionId: 'manager-rerender',
                managerTitle: 'Manager Rerender',
                memberRole: 'debugger',
                memberRevision: 2,
                membershipState: 'active',
                controlOwner: 'manager',
                projectStatus: 'active',
                activeMemberCount: 1,
                archivedMemberCount: 0,
                runningMemberCount: 1,
                blockedTaskCount: 0
            }
        })
        const { rerender } = renderSessionList({
            sessions: [baseMember]
        })

        expect(screen.getByText('Manager control')).toBeInTheDocument()
        expect(screen.queryByText('User takeover')).not.toBeInTheDocument()

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={[{
                        ...baseMember,
                        team: {
                            ...baseMember.team!,
                            controlOwner: 'user'
                        }
                    }]}
                    api={null}
                    selectedSessionId={null}
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('User takeover')).toBeInTheDocument()
        expect(screen.queryByText('Manager control')).not.toBeInTheDocument()
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

    it('shows awaiting input once takeover requests are pending even if thinking has not dropped yet', () => {
        const now = Date.now()

        render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-takeover',
                            active: true,
                            thinking: true,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            lifecycleState: 'running',
                            lifecycleStateSince: now,
                            pendingRequestsCount: 1,
                            metadata: {
                                path: '/Users/sugeh/Project/Viby',
                                flavor: 'codex',
                                summary: { text: 'Waiting for takeover', updatedAt: now }
                            }
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Awaiting input')).toBeInTheDocument()
        expect(screen.queryByText('Working')).not.toBeInTheDocument()
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
