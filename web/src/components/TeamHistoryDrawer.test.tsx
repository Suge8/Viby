import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamHistoryDrawer } from './TeamHistoryDrawer'

const harness = vi.hoisted(() => ({
    navigate: vi.fn(),
    historyState: {
        history: null as Record<string, unknown> | null,
        isLoading: false,
        error: null as string | null
    }
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => harness.navigate
}))

vi.mock('@/hooks/queries/useTeamProjectHistory', () => ({
    useTeamProjectHistory: () => harness.historyState
}))

afterEach(() => {
    harness.navigate.mockReset()
    harness.historyState.history = null
    harness.historyState.isLoading = false
    harness.historyState.error = null
})

function createSnapshot() {
    return {
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
            updatedAt: 3_000,
            deliveredAt: null,
            archivedAt: null
        },
        roles: [{
            projectId: 'project-1',
            id: 'implementer',
            source: 'builtin',
            prototype: 'implementer',
            name: 'implementer',
            promptExtension: null,
            providerFlavor: 'codex',
            model: null,
            reasoningEffort: null,
            isolationMode: 'worktree',
            createdAt: 1_000,
            updatedAt: 1_000
        }, {
            projectId: 'project-1',
            id: 'mobile-reviewer',
            source: 'custom',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on release risk.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 1_100,
            updatedAt: 1_100
        }, {
            projectId: 'project-1',
            id: 'verifier',
            source: 'builtin',
            prototype: 'verifier',
            name: 'verifier',
            promptExtension: null,
            providerFlavor: 'codex',
            model: null,
            reasoningEffort: null,
            isolationMode: 'simple',
            createdAt: 1_000,
            updatedAt: 1_000
        }],
        members: [{
            id: 'member-1',
            projectId: 'project-1',
            sessionId: 'member-session-1',
            managerSessionId: 'manager-session-1',
            role: 'implementer',
            roleId: 'implementer',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            workspaceRoot: null,
            controlOwner: 'manager',
            membershipState: 'archived',
            revision: 1,
            supersedesMemberId: null,
            supersededByMemberId: 'member-2',
            spawnedForTaskId: 'task-1',
            createdAt: 1_000,
            updatedAt: 2_000,
            archivedAt: 2_000,
            removedAt: null
        }, {
            id: 'member-2',
            projectId: 'project-1',
            sessionId: 'member-session-2',
            managerSessionId: 'manager-session-1',
            role: 'reviewer',
            roleId: 'mobile-reviewer',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            workspaceRoot: null,
            controlOwner: 'manager',
            membershipState: 'superseded',
            revision: 2,
            supersedesMemberId: 'member-1',
            supersededByMemberId: null,
            spawnedForTaskId: null,
            createdAt: 2_100,
            updatedAt: 3_000,
            archivedAt: 3_000,
            removedAt: null
        }, {
            id: 'member-3',
            projectId: 'project-1',
            sessionId: 'member-session-3',
            managerSessionId: 'manager-session-1',
            role: 'verifier',
            roleId: 'verifier',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            workspaceRoot: null,
            controlOwner: 'manager',
            membershipState: 'active',
            revision: 1,
            supersedesMemberId: null,
            supersededByMemberId: null,
            spawnedForTaskId: null,
            createdAt: 2_200,
            updatedAt: 3_000,
            archivedAt: null,
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
            reviewerMemberId: 'member-2',
            verifierMemberId: 'member-3',
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
}

describe('TeamHistoryDrawer', () => {
    it('renders historical members and timeline from the authoritative snapshot and history query', () => {
        harness.historyState.history = {
            projectId: 'project-1',
            events: [{
                id: 'event-project-reopened',
                projectId: 'project-1',
                kind: 'project-reopened',
                actorType: 'user',
                actorId: null,
                targetType: 'project',
                targetId: 'project-1',
                payload: {
                    status: 'active'
                },
                createdAt: 2_000
            }, {
                id: 'event-member-restored',
                projectId: 'project-1',
                kind: 'member-restored',
                actorType: 'user',
                actorId: null,
                targetType: 'member',
                targetId: 'member-1',
                payload: null,
                createdAt: 3_000
            }]
        }

        render(
            <TeamHistoryDrawer
                api={null as never}
                open
                onOpenChange={vi.fn()}
                projectId="project-1"
                currentMemberId="member-2"
                snapshot={createSnapshot() as never}
            />
        )

        expect(screen.getByText('历史成员')).toBeInTheDocument()
        expect(screen.getByText('implementer · r1')).toBeInTheDocument()
        expect(screen.getByText('已归档')).toBeInTheDocument()
        expect(screen.getByText('Mobile Reviewer (reviewer) · r2')).toBeInTheDocument()
        expect(screen.getByText('已被新 revision 替换')).toBeInTheDocument()
        expect(screen.getByText('源自 implementer · r1')).toBeInTheDocument()
        expect(screen.getByText('项目已恢复')).toBeInTheDocument()
        expect(screen.getByText('项目状态：active')).toBeInTheDocument()
        expect(screen.getByText('implementer · r1 已恢复')).toBeInTheDocument()
    })

    it('productizes phase-1 history events without falling back to raw enums', () => {
        harness.historyState.history = {
            projectId: 'project-1',
            events: [{
                id: 'event-project-updated',
                projectId: 'project-1',
                kind: 'project-updated',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'project',
                targetId: 'project-1',
                payload: {
                    updatedFields: ['maxActiveMembers', 'defaultIsolationMode'],
                    previousMaxActiveMembers: 6,
                    nextMaxActiveMembers: 4,
                    previousDefaultIsolationMode: 'hybrid',
                    nextDefaultIsolationMode: 'all_simple'
                },
                createdAt: 2_000
            }, {
                id: 'event-project-delivered',
                projectId: 'project-1',
                kind: 'project-delivered',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'project',
                targetId: 'project-1',
                payload: {
                    summary: '所有任务都已经完成交付。'
                },
                createdAt: 2_100
            }, {
                id: 'event-member-control-changed',
                projectId: 'project-1',
                kind: 'member-control-changed',
                actorType: 'system',
                actorId: null,
                targetType: 'member',
                targetId: 'member-1',
                payload: {
                    fromControlOwner: 'manager',
                    toControlOwner: 'user'
                },
                createdAt: 2_200
            }, {
                id: 'event-task-created',
                projectId: 'project-1',
                kind: 'task-created',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'task',
                targetId: 'task-1',
                payload: {
                    assigneeMemberId: 'member-1',
                    reviewerMemberId: 'member-2',
                    verifierMemberId: 'member-3'
                },
                createdAt: 2_300
            }, {
                id: 'event-task-updated',
                projectId: 'project-1',
                kind: 'task-updated',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'task',
                targetId: 'task-1',
                payload: {
                    updatedFields: ['acceptanceCriteria', 'priority'],
                    note: '补全验收标准并提升优先级。'
                },
                createdAt: 2_400
            }, {
                id: 'event-task-assigned',
                projectId: 'project-1',
                kind: 'task-assigned',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'task',
                targetId: 'task-1',
                payload: {
                    fromAssigneeMemberId: 'member-1',
                    toAssigneeMemberId: 'member-2',
                    note: '这轮改由 reviewer 接手。'
                },
                createdAt: 2_500
            }, {
                id: 'event-task-status-changed',
                projectId: 'project-1',
                kind: 'task-status-changed',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'task',
                targetId: 'task-1',
                payload: {
                    fromStatus: 'running',
                    toStatus: 'blocked',
                    note: '等待 route contract 定稿。'
                },
                createdAt: 2_600
            }, {
                id: 'event-task-commented',
                projectId: 'project-1',
                kind: 'task-commented',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'task',
                targetId: 'task-1',
                payload: {
                    comment: '先锁定 root cause，再动 Web。'
                },
                createdAt: 2_700
            }, {
                id: 'event-broadcast-sent',
                projectId: 'project-1',
                kind: 'broadcast-sent',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'project',
                targetId: 'project-1',
                payload: {
                    text: '今天先把 focused validation 全部跑完。'
                },
                createdAt: 2_800
            }, {
                id: 'event-direct-message-sent',
                projectId: 'project-1',
                kind: 'direct-message-sent',
                actorType: 'manager',
                actorId: 'manager-session-1',
                targetType: 'member',
                targetId: 'member-1',
                payload: {
                    text: '请先检查最新失败测试。'
                },
                createdAt: 2_900
            }]
        }

        render(
            <TeamHistoryDrawer
                api={null as never}
                open
                onOpenChange={vi.fn()}
                projectId="project-1"
                snapshot={createSnapshot() as never}
            />
        )

        expect(screen.getByText('项目设置已更新')).toBeInTheDocument()
        expect(screen.getByText('最大活跃成员：6 -> 4；默认隔离模式：Hybrid -> All simple')).toBeInTheDocument()
        expect(screen.getByText('项目已交付')).toBeInTheDocument()
        expect(screen.getByText('所有任务都已经完成交付。')).toBeInTheDocument()
        expect(screen.getByText('implementer · r1 控制权已变更')).toBeInTheDocument()
        expect(screen.getByText('控制权：经理 -> 用户')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship manager teams」已创建')).toBeInTheDocument()
        expect(screen.getByText('指派给 implementer · r1；reviewer：Mobile Reviewer (reviewer) · r2；verifier：verifier · r1')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship manager teams」已更新')).toBeInTheDocument()
        expect(screen.getByText('已更新：验收标准、优先级；补全验收标准并提升优先级。')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship manager teams」已分配给 Mobile Reviewer (reviewer) · r2')).toBeInTheDocument()
        expect(screen.getByText('原负责人：implementer · r1；当前负责人：Mobile Reviewer (reviewer) · r2；这轮改由 reviewer 接手。')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship manager teams」状态已更新')).toBeInTheDocument()
        expect(screen.getByText('状态：进行中 -> 阻塞中；等待 route contract 定稿。')).toBeInTheDocument()
        expect(screen.getByText('任务「Ship manager teams」新增备注')).toBeInTheDocument()
        expect(screen.getByText('先锁定 root cause，再动 Web。')).toBeInTheDocument()
        expect(screen.getByText('经理已发送团队广播')).toBeInTheDocument()
        expect(screen.getByText('今天先把 focused validation 全部跑完。')).toBeInTheDocument()
        expect(screen.getByText('implementer · r1 收到经理消息')).toBeInTheDocument()
        expect(screen.getByText('请先检查最新失败测试。')).toBeInTheDocument()
        expect(screen.queryByText('project-updated')).toBeNull()
        expect(screen.queryByText('task-status-changed')).toBeNull()
        expect(screen.queryByText('direct-message-sent')).toBeNull()
    })

    it('exposes team-aware history actions for opening sessions and restoring archived members', async () => {
        const api = {
            unarchiveSession: vi.fn(async (sessionId: string) => ({
                id: sessionId
            }))
        }

        render(
            <TeamHistoryDrawer
                api={api as never}
                open
                onOpenChange={vi.fn()}
                projectId="project-1"
                snapshot={createSnapshot() as never}
            />
        )

        screen.getByRole('button', { name: '打开经理会话' }).click()
        expect(harness.navigate).toHaveBeenCalledWith({
            to: '/sessions/$sessionId',
            params: {
                sessionId: 'manager-session-1'
            }
        })

        screen.getByRole('button', { name: '打开 implementer · r1 会话' }).click()
        expect(harness.navigate).toHaveBeenCalledWith({
            to: '/sessions/$sessionId',
            params: {
                sessionId: 'member-session-1'
            }
        })

        screen.getByRole('button', { name: '恢复 implementer · r1' }).click()

        await waitFor(() => {
            expect(api.unarchiveSession).toHaveBeenCalledWith('member-session-1')
        })
        await waitFor(() => {
            expect(harness.navigate).toHaveBeenCalledWith({
                to: '/sessions/$sessionId',
                params: {
                    sessionId: 'member-session-1'
                }
            })
        })

        expect(screen.queryByRole('button', { name: '恢复 Mobile Reviewer (reviewer) · r2' })).toBeNull()
    })
})
