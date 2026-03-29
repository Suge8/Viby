import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectPanel } from './ProjectPanel'

const harness = vi.hoisted(() => ({
    teamProjectState: {
        snapshot: null as Record<string, unknown> | null,
        isLoading: false,
        error: null as string | null,
        refetch: vi.fn(async () => undefined)
    }
}))

vi.mock('@/hooks/queries/useTeamProject', () => ({
    useTeamProject: () => harness.teamProjectState
}))

afterEach(() => {
    cleanup()
    harness.teamProjectState.snapshot = null
    harness.teamProjectState.isLoading = false
    harness.teamProjectState.error = null
    harness.teamProjectState.refetch.mockClear()
})

function renderProjectPanel(options?: {
    sessionRole?: 'manager' | 'member'
    snapshot?: Record<string, unknown> | null
    api?: { updateTeamProjectSettings: ReturnType<typeof vi.fn> } | null
}): void {
    harness.teamProjectState.snapshot = options?.snapshot ?? null

    render(
        <ProjectPanel
            api={(options?.api ?? null) as never}
            session={{
                id: 'session-1',
                teamContext: {
                    projectId: 'project-1',
                    sessionRole: options?.sessionRole ?? 'manager',
                    managerSessionId: 'manager-session-1',
                    managerTitle: 'Manager Project',
                    projectStatus: 'active',
                    activeMemberCount: 2,
                    runningMemberCount: 1,
                    blockedTaskCount: 0,
                    archivedMemberCount: 0
                }
            } as never}
        />
    )
}

describe('ProjectPanel', () => {
    it('shows acceptance summaries and recent acceptance results from the authoritative snapshot', () => {
        renderProjectPanel({
            snapshot: {
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    deliveredAt: null,
                    archivedAt: null
                },
                members: [],
                tasks: [{
                    id: 'task-1',
                    projectId: 'project-1',
                    parentTaskId: null,
                    title: 'Ship acceptance chain',
                    description: null,
                    acceptanceCriteria: 'Review, verify, then accept',
                    status: 'in_verification',
                    assigneeMemberId: 'member-implementer',
                    reviewerMemberId: 'member-reviewer',
                    verifierMemberId: 'member-verifier',
                    priority: 'high',
                    dependsOn: [],
                    retryCount: 0,
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    completedAt: null
                }],
                events: [],
                acceptance: {
                    tasks: {
                        'task-1': {
                            reviewStatus: 'passed',
                            verificationStatus: 'passed',
                            managerAccepted: false,
                            skipVerificationReason: null,
                            latestAcceptanceEvent: {
                                id: 'event-verification-passed',
                                projectId: 'project-1',
                                kind: 'verification-passed',
                                actorType: 'member',
                                actorId: 'member-verifier',
                                targetType: 'task',
                                targetId: 'task-1',
                                payload: {
                                    summary: 'focused tests 和 smoke 都通过。'
                                },
                                createdAt: 2_000
                            },
                            recentEvents: [{
                                id: 'event-review-passed',
                                projectId: 'project-1',
                                kind: 'review-passed',
                                actorType: 'member',
                                actorId: 'member-reviewer',
                                targetType: 'task',
                                targetId: 'task-1',
                                payload: {
                                    summary: '回归风险可控，测试覆盖足够。'
                                },
                                createdAt: 1_900
                            }, {
                                id: 'event-verification-passed',
                                projectId: 'project-1',
                                kind: 'verification-passed',
                                actorType: 'member',
                                actorId: 'member-verifier',
                                targetType: 'task',
                                targetId: 'task-1',
                                payload: {
                                    summary: 'focused tests 和 smoke 都通过。'
                                },
                                createdAt: 2_000
                            }]
                        }
                    },
                    recentResults: [{
                        id: 'event-verification-passed',
                        projectId: 'project-1',
                        kind: 'verification-passed',
                        actorType: 'member',
                        actorId: 'member-verifier',
                        targetType: 'task',
                        targetId: 'task-1',
                        payload: {
                            summary: 'focused tests 和 smoke 都通过。'
                        },
                        createdAt: 2_000
                    }]
                }
            }
        })

        expect(screen.getByText('verification 通过，待经理验收')).toBeInTheDocument()
        expect(screen.getByText('Recent Acceptance')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship acceptance chain」verification 通过')).toBeInTheDocument()
        expect(screen.getByText('focused tests 和 smoke 都通过。')).toBeInTheDocument()
    })

    it('renders active roster labels from the authoritative role catalog', () => {
        renderProjectPanel({
            snapshot: {
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    deliveredAt: null,
                    archivedAt: null
                },
                roles: [{
                    projectId: 'project-1',
                    id: 'mobile-implementer',
                    source: 'custom',
                    prototype: 'implementer',
                    name: 'Mobile Implementer',
                    promptExtension: 'Focus on handset UX.',
                    providerFlavor: 'codex',
                    model: 'gpt-5.4',
                    reasoningEffort: 'high',
                    isolationMode: 'worktree',
                    createdAt: 1_000,
                    updatedAt: 1_000
                }],
                members: [{
                    id: 'member-1',
                    projectId: 'project-1',
                    sessionId: 'member-session-1',
                    managerSessionId: 'manager-session-1',
                    role: 'implementer',
                    roleId: 'mobile-implementer',
                    providerFlavor: 'codex',
                    model: 'gpt-5.4',
                    reasoningEffort: 'high',
                    isolationMode: 'worktree',
                    workspaceRoot: null,
                    controlOwner: 'manager',
                    membershipState: 'active',
                    revision: 2,
                    supersedesMemberId: 'member-0',
                    supersededByMemberId: null,
                    spawnedForTaskId: 'task-1',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    archivedAt: null,
                    removedAt: null
                }],
                tasks: [],
                events: [],
                acceptance: {
                    tasks: {},
                    recentResults: []
                }
            }
        })

        expect(screen.getByText('Mobile Implementer (implementer) · r2')).toBeInTheDocument()
    })

    it('saves project settings through the authoritative API surface', async () => {
        const api = {
            updateTeamProjectSettings: vi.fn(async () => ({
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 4,
                    defaultIsolationMode: 'all_simple',
                    createdAt: 1_000,
                    updatedAt: 3_000,
                    deliveredAt: null,
                    archivedAt: null
                }
            }))
        }

        renderProjectPanel({
            api,
            snapshot: {
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    deliveredAt: null,
                    archivedAt: null
                },
                members: [],
                tasks: [],
                events: [],
                acceptance: {
                    tasks: {},
                    recentResults: []
                }
            }
        })

        fireEvent.change(screen.getByLabelText('Max active members'), {
            target: { value: '4' }
        })
        fireEvent.change(screen.getByLabelText('Default isolation'), {
            target: { value: 'all_simple' }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))

        await waitFor(() => {
            expect(api.updateTeamProjectSettings).toHaveBeenCalledWith('project-1', {
                managerSessionId: 'manager-session-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            })
        })
        await waitFor(() => {
            expect(harness.teamProjectState.refetch).toHaveBeenCalled()
        })
    })

    it('renders nothing for non-manager sessions', () => {
        const { container } = render(
            <ProjectPanel
                api={null as never}
                session={{
                    id: 'session-1',
                    teamContext: {
                        projectId: 'project-1',
                        sessionRole: 'member',
                        managerSessionId: 'manager-session-1',
                        projectStatus: 'active'
                    }
                } as never}
            />
        )

        expect(container.firstChild).toBeNull()
    })

    it('throws when the authoritative snapshot is missing a task acceptance record', () => {
        expect(() => renderProjectPanel({
            snapshot: {
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    deliveredAt: null,
                    archivedAt: null
                },
                members: [],
                tasks: [{
                    id: 'task-1',
                    projectId: 'project-1',
                    parentTaskId: null,
                    title: 'Ship acceptance chain',
                    description: null,
                    acceptanceCriteria: 'Review, verify, then accept',
                    status: 'in_review',
                    assigneeMemberId: 'member-implementer',
                    reviewerMemberId: 'member-reviewer',
                    verifierMemberId: null,
                    priority: 'high',
                    dependsOn: [],
                    retryCount: 0,
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    completedAt: null
                }],
                events: [],
                acceptance: {
                    tasks: {},
                    recentResults: []
                }
            }
        })).toThrow('Missing authoritative acceptance record for team task task-1')
    })
    it('opens the lazy role manager dialog from the manager project surface', async () => {
        renderProjectPanel({
            api: {
                updateTeamProjectSettings: vi.fn(async () => undefined),
                createTeamRole: vi.fn(async () => undefined),
                updateTeamRole: vi.fn(async () => undefined),
                deleteTeamRole: vi.fn(async () => undefined),
                getTeamProjectPreset: vi.fn(async () => ({
                    schemaVersion: 1,
                    projectSettings: {
                        maxActiveMembers: 6,
                        defaultIsolationMode: 'hybrid'
                    },
                    roles: []
                })),
                applyTeamProjectPreset: vi.fn(async () => undefined)
            } as never,
            snapshot: {
                project: {
                    id: 'project-1',
                    managerSessionId: 'manager-session-1',
                    machineId: 'machine-1',
                    rootDirectory: '/tmp/project',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    createdAt: 1_000,
                    updatedAt: 2_000,
                    deliveredAt: null,
                    archivedAt: null
                },
                roles: [],
                members: [],
                tasks: [],
                events: [],
                acceptance: {
                    tasks: {},
                    recentResults: []
                }
            }
        })

        fireEvent.click(screen.getByRole('button', { name: '管理角色' }))

        expect(await screen.findByText('Role Catalog & Preset')).toBeInTheDocument()
    })

})
