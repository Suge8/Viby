import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemberControlBanner } from './MemberControlBanner'

const navigateMock = vi.fn()
const harness = vi.hoisted(() => ({
    teamProjectState: {
        snapshot: null as Record<string, unknown> | null
    },
    controlState: {
        interject: vi.fn(async () => undefined),
        takeOver: vi.fn(async () => undefined),
        returnToManager: vi.fn(async () => undefined),
        isPending: false,
        error: null as string | null
    }
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => navigateMock
}))

vi.mock('@/hooks/queries/useTeamProject', () => ({
    useTeamProject: () => harness.teamProjectState
}))

vi.mock('@/hooks/mutations/useTeamMemberControlActions', () => ({
    useTeamMemberControlActions: () => harness.controlState
}))

beforeEach(() => {
    navigateMock.mockReset()
})

afterEach(() => {
    harness.teamProjectState.snapshot = null
    harness.controlState.error = null
    harness.controlState.isPending = false
})

describe('MemberControlBanner', () => {
    it('locks historical members to history-only mode', () => {
        harness.teamProjectState.snapshot = {
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
            members: [{
                id: 'member-1',
                projectId: 'project-1',
                sessionId: 'member-session-1',
                managerSessionId: 'manager-session-1',
                role: 'implementer',
                providerFlavor: 'codex',
                model: 'gpt-5.4',
                reasoningEffort: 'high',
                isolationMode: 'simple',
                workspaceRoot: null,
                controlOwner: 'manager',
                membershipState: 'archived',
                revision: 1,
                supersedesMemberId: null,
                supersededByMemberId: null,
                spawnedForTaskId: 'task-1',
                createdAt: 1_000,
                updatedAt: 2_000,
                archivedAt: 2_000,
                removedAt: null
            }],
            tasks: [{
                id: 'task-1',
                projectId: 'project-1',
                parentTaskId: null,
                title: 'Ship manager teams',
                description: null,
                acceptanceCriteria: null,
                status: 'done',
                assigneeMemberId: 'member-1',
                reviewerMemberId: null,
                verifierMemberId: null,
                priority: null,
                dependsOn: [],
                retryCount: 0,
                createdAt: 1_000,
                updatedAt: 2_000,
                completedAt: 2_000
            }],
            events: [],
            acceptance: {
                tasks: {},
                recentResults: []
            }
        }

        render(
            <MemberControlBanner
                api={null as never}
                session={{
                    id: 'member-session-1',
                    teamContext: {
                        projectId: 'project-1',
                        sessionRole: 'member',
                        managerSessionId: 'manager-session-1',
                        managerTitle: 'Manager Project',
                        memberId: 'member-1',
                        memberRole: 'implementer',
                        memberRoleName: 'Mobile Implementer',
                        memberRevision: 1,
                        controlOwner: 'manager',
                        membershipState: 'archived',
                        projectStatus: 'active'
                    }
                } as never}
            />
        )

        expect(screen.getByText('Mobile Implementer · r1')).toBeInTheDocument()
        expect(screen.getByText('已归档')).toBeInTheDocument()
        expect(screen.getByText('该成员当前处于已归档状态。')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '插话一次' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '接管成员' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '归还经理' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '查看历史' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '查看经理' })).toBeInTheDocument()
    })

    it('shows the authoritative control error inline when a member action is rejected', () => {
        harness.controlState.error = '成员正在完成上一条用户插话，请等 ready 后再继续。'

        render(
            <MemberControlBanner
                api={null as never}
                session={{
                    id: 'member-session-1',
                    teamContext: {
                        projectId: 'project-1',
                        sessionRole: 'member',
                        managerSessionId: 'manager-session-1',
                        managerTitle: 'Manager Project',
                        memberId: 'member-1',
                        memberRole: 'implementer',
                        memberRoleName: 'Mobile Implementer',
                        memberRevision: 1,
                        controlOwner: 'manager',
                        membershipState: 'active',
                        projectStatus: 'active'
                    }
                } as never}
            />
        )

        expect(screen.getByText('成员控制动作失败')).toBeInTheDocument()
        expect(screen.getByText('成员正在完成上一条用户插话，请等 ready 后再继续。')).toBeInTheDocument()
    })
})
