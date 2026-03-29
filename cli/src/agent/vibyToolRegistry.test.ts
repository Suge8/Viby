import { describe, expect, it, vi } from 'vitest'
import type {
    SessionTeamContext,
    TeamProjectSnapshot
} from '@viby/protocol/types'
import type { ApiSessionClient } from '@/api/apiSession'
import {
    getEnabledVibyToolDefinitions,
    type VibyToolResult
} from './vibyToolRegistry'

function parseJsonResult(result: VibyToolResult): Record<string, any> {
    expect(result.isError).toBe(false)
    expect(result.content[0]?.type).toBe('text')
    return JSON.parse(result.content[0]?.text ?? '{}')
}

function createCompactStaffing(
    remainingMemberSlots: number
): TeamProjectSnapshot['compactBrief']['staffing'] {
    if (remainingMemberSlots === 0) {
        return {
            seatPressure: 'at_capacity',
            remainingMemberSlots,
            hints: []
        }
    }
    if (remainingMemberSlots === 1) {
        return {
            seatPressure: 'limited',
            remainingMemberSlots,
            hints: []
        }
    }

    return {
        seatPressure: 'available',
        remainingMemberSlots,
        hints: []
    }
}

function createSnapshot(eventKind: TeamProjectSnapshot['events'][number]['kind']): TeamProjectSnapshot {
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
            updatedAt: 2_000,
            deliveredAt: null,
            archivedAt: null
        },
        roles: [{
            projectId: 'project-1',
            id: 'reviewer-mobile',
            source: 'custom',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 1_005,
            updatedAt: 1_005
        }, {
            projectId: 'project-1',
            id: 'verifier-web',
            source: 'custom',
            prototype: 'verifier',
            name: 'Web Verifier',
            promptExtension: null,
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 1_006,
            updatedAt: 1_006
        }],
        members: [{
            id: 'member-reviewer',
            projectId: 'project-1',
            sessionId: 'reviewer-session-1',
            managerSessionId: 'manager-session-1',
            role: 'reviewer',
            roleId: 'reviewer-mobile',
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
            createdAt: 1_010,
            updatedAt: 1_010,
            archivedAt: null,
            removedAt: null
        }, {
            id: 'member-verifier',
            projectId: 'project-1',
            sessionId: 'verifier-session-1',
            managerSessionId: 'manager-session-1',
            role: 'verifier',
            roleId: 'verifier-web',
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
            createdAt: 1_011,
            updatedAt: 1_011,
            archivedAt: null,
            removedAt: null
        }],
        tasks: [{
            id: 'task-1',
            projectId: 'project-1',
            parentTaskId: null,
            title: 'Ship acceptance chain',
            description: null,
            acceptanceCriteria: 'Review, verify, then accept',
            status: eventKind === 'manager-accepted'
                ? 'done'
                : eventKind.startsWith('verification')
                    ? 'in_verification'
                    : 'in_review',
            assigneeMemberId: 'member-implementer',
            reviewerMemberId: 'member-reviewer',
            verifierMemberId: eventKind.startsWith('verification') || eventKind === 'manager-accepted'
                ? 'member-verifier'
                : null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_000,
            updatedAt: 2_000,
            completedAt: eventKind === 'manager-accepted' ? 2_000 : null
        }],
        events: [{
            id: `event-${eventKind}`,
            projectId: 'project-1',
            kind: eventKind,
            actorType: eventKind === 'review-requested' || eventKind === 'manager-accepted'
                ? 'manager'
                : 'member',
            actorId: eventKind === 'manager-accepted'
                ? 'manager-session-1'
                : eventKind === 'verification-passed'
                    ? 'member-verifier'
                    : 'member-reviewer',
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: `${eventKind} summary`
            },
            createdAt: 2_000
        }],
        acceptance: {
            tasks: {
                'task-1': {
                    reviewStatus: eventKind === 'review-requested'
                        ? 'requested'
                        : eventKind === 'review-passed'
                            ? 'passed'
                            : eventKind === 'review-failed'
                                ? 'failed'
                                : eventKind.startsWith('verification') || eventKind === 'manager-accepted'
                                    ? 'passed'
                                    : 'idle',
                    verificationStatus: eventKind === 'verification-requested'
                        ? 'requested'
                        : eventKind === 'verification-passed'
                            || eventKind === 'manager-accepted'
                            ? 'passed'
                            : eventKind === 'verification-failed'
                                ? 'failed'
                                : 'idle',
                    managerAccepted: eventKind === 'manager-accepted',
                    skipVerificationReason: null,
                    latestAcceptanceEvent: {
                        id: `event-${eventKind}`,
                        projectId: 'project-1',
                        kind: eventKind,
                        actorType: eventKind === 'review-requested' || eventKind === 'manager-accepted'
                            ? 'manager'
                            : 'member',
                        actorId: eventKind === 'manager-accepted'
                            ? 'manager-session-1'
                            : eventKind === 'verification-passed'
                                ? 'member-verifier'
                                : 'member-reviewer',
                        targetType: 'task',
                        targetId: 'task-1',
                        payload: {
                            summary: `${eventKind} summary`
                        },
                        createdAt: 2_000
                    },
                    recentEvents: [{
                        id: `event-${eventKind}`,
                        projectId: 'project-1',
                        kind: eventKind,
                        actorType: eventKind === 'review-requested' || eventKind === 'manager-accepted'
                            ? 'manager'
                            : 'member',
                        actorId: eventKind === 'manager-accepted'
                            ? 'manager-session-1'
                            : eventKind === 'verification-passed'
                                ? 'member-verifier'
                                : 'member-reviewer',
                        targetType: 'task',
                        targetId: 'task-1',
                        payload: {
                            summary: `${eventKind} summary`
                        },
                        createdAt: 2_000
                    }]
                }
            },
            recentResults: eventKind === 'review-requested' || eventKind === 'verification-requested'
                ? []
                : [{
                    id: `event-${eventKind}`,
                    projectId: 'project-1',
                    kind: eventKind,
                    actorType: eventKind === 'manager-accepted'
                        ? 'manager'
                        : 'member',
                    actorId: eventKind === 'manager-accepted'
                        ? 'manager-session-1'
                        : eventKind === 'verification-passed'
                            ? 'member-verifier'
                            : 'member-reviewer',
                    targetType: 'task',
                    targetId: 'task-1',
                    payload: {
                        summary: `${eventKind} summary`
                    },
                    createdAt: 2_000
                }]
        },
        compactBrief: {
            project: {
                id: 'project-1',
                title: 'Manager Project',
                goal: 'Ship manager teams',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                updatedAt: 2_000,
                deliveredAt: null
            },
            summary: 'Manager compact brief test fixture.',
            counts: {
                activeMemberCount: 2,
                inactiveMemberCount: 0,
                openTaskCount: eventKind === 'manager-accepted' ? 0 : 1,
                blockedTaskCount: 0,
                reviewFailedTaskCount: eventKind === 'review-failed' ? 1 : 0,
                verificationFailedTaskCount: eventKind === 'verification-failed' ? 1 : 0,
                readyForManagerAcceptanceCount: eventKind === 'verification-passed' ? 1 : 0,
                deliveryReady: eventKind === 'manager-accepted'
            },
            staffing: createCompactStaffing(4),
            activeMembers: [{
                id: 'member-reviewer',
                sessionId: 'reviewer-session-1',
                role: 'reviewer',
                roleId: 'reviewer-mobile',
                roleName: 'Mobile Reviewer',
                membershipState: 'active',
                controlOwner: 'manager',
                revision: 1,
                spawnedForTaskId: null,
                updatedAt: 1_010
            }, {
                id: 'member-verifier',
                sessionId: 'verifier-session-1',
                role: 'verifier',
                roleId: 'verifier-web',
                roleName: 'Web Verifier',
                membershipState: 'active',
                controlOwner: 'manager',
                revision: 1,
                spawnedForTaskId: null,
                updatedAt: 1_011
            }],
            inactiveMembers: [],
            openTasks: eventKind === 'manager-accepted' ? [] : [{
                id: 'task-1',
                title: 'Ship acceptance chain',
                status: eventKind.startsWith('verification') ? 'in_verification' : 'in_review',
                priority: 'high',
                assigneeMemberId: 'member-implementer',
                reviewerMemberId: 'member-reviewer',
                verifierMemberId: eventKind.startsWith('verification') ? 'member-verifier' : null,
                retryCount: 0,
                updatedAt: 2_000,
                acceptance: {
                    reviewStatus: eventKind === 'review-requested'
                        ? 'requested'
                        : eventKind === 'review-passed'
                            ? 'passed'
                            : eventKind === 'review-failed'
                                ? 'failed'
                                : eventKind.startsWith('verification')
                                    ? 'passed'
                                    : 'idle',
                    verificationStatus: eventKind === 'verification-requested'
                        ? 'requested'
                        : eventKind === 'verification-passed'
                            ? 'passed'
                            : eventKind === 'verification-failed'
                                ? 'failed'
                                : 'idle',
                    managerAccepted: false,
                    skipVerificationReason: null,
                    latestAcceptanceEvent: {
                        id: `event-${eventKind}`,
                        projectId: 'project-1',
                        kind: eventKind,
                        actorType: eventKind === 'review-requested'
                            ? 'manager'
                            : 'member',
                        actorId: eventKind === 'verification-passed' ? 'member-verifier' : 'member-reviewer',
                        targetType: 'task',
                        targetId: 'task-1',
                        payload: {
                            summary: `${eventKind} summary`
                        },
                        createdAt: 2_000
                    }
                }
            }],
            recentEvents: [{
                id: `event-${eventKind}`,
                kind: eventKind,
                targetId: 'task-1',
                createdAt: 2_000,
                summary: `${eventKind} summary`
            }],
            recentAcceptanceResults: eventKind === 'review-requested' || eventKind === 'verification-requested'
                ? []
                : [{
                    id: `event-${eventKind}`,
                    kind: eventKind,
                    targetId: 'task-1',
                    createdAt: 2_000,
                    summary: `${eventKind} summary`
                }],
            wakeReasons: eventKind === 'review-failed'
                ? [{
                    kind: 'review-failed',
                    priority: 'high',
                    summary: 'Task "Ship acceptance chain" failed review and needs revision or reassignment.',
                    taskId: 'task-1',
                    memberId: 'member-implementer',
                    eventId: `event-${eventKind}`,
                    eventKind
                }]
                : eventKind === 'verification-failed'
                    ? [{
                        kind: 'verification-failed',
                        priority: 'high',
                        summary: 'Task "Ship acceptance chain" failed verification and needs another implementation pass.',
                        taskId: 'task-1',
                        memberId: 'member-implementer',
                        eventId: `event-${eventKind}`,
                        eventKind
                    }]
                    : eventKind === 'manager-accepted'
                        ? [{
                            kind: 'ready-to-deliver',
                            priority: 'medium',
                            summary: 'All tracked tasks are manager-accepted and the project is ready to deliver.',
                            taskId: null,
                            memberId: null,
                            eventId: null,
                            eventKind: null
                        }]
                        : [],
            nextActions: eventKind === 'verification-passed'
                ? [{
                    kind: 'perform-manager-acceptance',
                    summary: 'Perform manager acceptance for task "Ship acceptance chain".',
                    taskId: 'task-1',
                    memberId: 'member-implementer',
                    wakeReasonKind: null
                }]
                : eventKind === 'manager-accepted'
                    ? [{
                        kind: 'deliver-project',
                        summary: 'Deliver the project when the final human-facing output is confirmed.',
                        taskId: null,
                        memberId: null,
                        wakeReasonKind: 'ready-to-deliver'
                    }]
                    : []
        }
    }
}

function findTool(
    teamContext: SessionTeamContext | undefined,
    toolName: string
) {
    const tool = getEnabledVibyToolDefinitions(teamContext).find((definition) => definition.name === toolName)
    if (!tool) {
        throw new Error(`Expected tool ${toolName} to be enabled`)
    }
    return tool
}

describe('vibyToolRegistry', () => {
    it('enables the correct tool surface for each manager-teams role', () => {
        const managerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        }
        const reviewerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            memberId: 'member-reviewer',
            memberRole: 'reviewer',
            memberRoleId: 'reviewer-mobile',
            memberRoleName: 'Mobile Reviewer',
            projectStatus: 'active'
        }
        const verifierContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            memberId: 'member-verifier',
            memberRole: 'verifier',
            memberRoleId: 'verifier-web',
            memberRoleName: 'Web Verifier',
            projectStatus: 'active'
        }

        expect(getEnabledVibyToolDefinitions(undefined).map((tool) => tool.name)).toEqual([
            'change_title'
        ])
        expect(getEnabledVibyToolDefinitions(managerContext).map((tool) => tool.name)).toEqual([
            'change_title',
            'team_get_snapshot',
            'team_spawn_member',
            'team_create_role',
            'team_update_role',
            'team_delete_role',
            'team_update_member',
            'team_create_task',
            'team_update_task',
            'team_message_member',
            'team_request_review',
            'team_request_verification',
            'team_accept_task',
            'team_close_project'
        ])
        expect(getEnabledVibyToolDefinitions(reviewerContext).map((tool) => tool.name)).toEqual([
            'change_title',
            'team_get_snapshot',
            'team_submit_review_result'
        ])
        expect(getEnabledVibyToolDefinitions(verifierContext).map((tool) => tool.name)).toEqual([
            'change_title',
            'team_get_snapshot',
            'team_submit_verification_result'
        ])
    })

    it('routes manager review requests through the authoritative api client and refreshes acceptance state', async () => {
        const managerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        }
        const client = {
            requestTaskReview: vi.fn(async () => createSnapshot('review-requested').tasks[0]),
            getTeamProject: vi.fn(async () => createSnapshot('review-requested'))
        } as unknown as ApiSessionClient
        const tool = findTool(managerContext, 'team_request_review')

        const result = await tool.execute({
            client,
            teamContext: managerContext
        }, {
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer',
            note: '重点看回归'
        })

        expect(client.requestTaskReview).toHaveBeenCalledWith('task-1', {
            managerSessionId: 'manager-session-1',
            reviewerMemberId: 'member-reviewer',
            note: '重点看回归'
        })
        expect(client.getTeamProject).toHaveBeenCalledWith('project-1')
        const payload = parseJsonResult(result)
        expect(payload.action).toBe('review_requested')
        expect(payload.task.acceptance.reviewStatus).toBe('requested')
        expect(payload.roles[0]).toMatchObject({ id: 'reviewer-mobile' })
        expect(payload.compactBrief.project.title).toBe('Manager Project')
    })

    it('rethrows authoritative control conflicts so the outer MCP bridge can format the tool error result', async () => {
        const managerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        }
        const client = {
            requestTaskReview: vi.fn(async () => {
                throw new Error('Team member is still completing a user interjection')
            })
        } as unknown as ApiSessionClient
        const tool = findTool(managerContext, 'team_request_review')

        await expect(tool.execute({
            client,
            teamContext: managerContext
        }, {
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })).rejects.toThrow('Team member is still completing a user interjection')

        expect(client.requestTaskReview).toHaveBeenCalledWith('task-1', {
            managerSessionId: 'manager-session-1',
            reviewerMemberId: 'member-reviewer',
            note: undefined
        })
    })

    it('routes manager orchestration tools through the authoritative api client surface', async () => {
        const managerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        }
        const spawnedSnapshot = createSnapshot('review-requested')
        spawnedSnapshot.members = [{
            id: 'member-implementer',
            projectId: 'project-1',
            sessionId: 'member-implementer-session',
            managerSessionId: 'manager-session-1',
            role: 'implementer',
            roleId: 'implementer',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project-worktrees/member-implementer',
            controlOwner: 'manager',
            membershipState: 'active',
            revision: 2,
            supersedesMemberId: 'member-old',
            supersededByMemberId: null,
            spawnedForTaskId: 'task-1',
            createdAt: 2_000,
            updatedAt: 2_000,
            archivedAt: null,
            removedAt: null
        }]
        const deliveredSnapshot = createSnapshot('manager-accepted')
        deliveredSnapshot.project.status = 'delivered'
        deliveredSnapshot.project.deliveredAt = 3_000
        const client = {
            spawnTeamMember: vi.fn(async () => ({
                ok: true,
                member: spawnedSnapshot.members[0],
                session: undefined,
                launch: {
                    strategy: 'revision',
                    reason: 'provider_flavor_changed',
                    previousMemberId: 'member-old'
                }
            })),
            createTeamTask: vi.fn(async () => spawnedSnapshot.tasks[0]),
            closeTeamProject: vi.fn(async () => deliveredSnapshot.project),
            getTeamProject: vi
                .fn(async () => spawnedSnapshot)
                .mockResolvedValueOnce(spawnedSnapshot)
                .mockResolvedValueOnce(spawnedSnapshot)
                .mockResolvedValueOnce(deliveredSnapshot)
        } as unknown as ApiSessionClient

        const spawnTool = findTool(managerContext, 'team_spawn_member')
        const createTaskTool = findTool(managerContext, 'team_create_task')
        const closeProjectTool = findTool(managerContext, 'team_close_project')

        const spawnResult = await spawnTool.execute({
            client,
            teamContext: managerContext
        }, {
            roleId: 'implementer',
            taskId: 'task-1'
        })
        const createTaskResult = await createTaskTool.execute({
            client,
            teamContext: managerContext
        }, {
            title: 'Ship orchestration owner'
        })
        const closeProjectResult = await closeProjectTool.execute({
            client,
            teamContext: managerContext
        }, {})

        expect(client.spawnTeamMember).toHaveBeenCalledWith({
            managerSessionId: 'manager-session-1',
            roleId: 'implementer',
            taskId: 'task-1'
        })
        expect(client.createTeamTask).toHaveBeenCalledWith({
            managerSessionId: 'manager-session-1',
            title: 'Ship orchestration owner'
        })
        expect(client.closeTeamProject).toHaveBeenCalledWith('project-1', {
            managerSessionId: 'manager-session-1',
            summary: undefined
        })
        expect(parseJsonResult(spawnResult)).toMatchObject({
            action: 'member_spawned',
            member: {
                id: 'member-implementer'
            },
            launch: {
                strategy: 'revision'
            }
        })
        expect(parseJsonResult(createTaskResult)).toMatchObject({
            action: 'task_created',
            task: {
                id: 'task-1'
            }
        })
        expect(parseJsonResult(closeProjectResult)).toMatchObject({
            action: 'project_closed',
            project: {
                status: 'delivered'
            }
        })
    })


    it('routes role catalog tools through the authoritative api client surface', async () => {
        const managerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        }
        const createdSnapshot = createSnapshot('review-requested')
        createdSnapshot.roles = [...createdSnapshot.roles, {
            projectId: 'project-1',
            id: 'architect-system',
            source: 'custom',
            prototype: 'architect',
            name: 'System Architect',
            promptExtension: 'Focus on boundaries and interface ownership.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 2_100,
            updatedAt: 2_100
        }]
        const updatedSnapshot = createSnapshot('review-requested')
        updatedSnapshot.roles = [...updatedSnapshot.roles, {
            projectId: 'project-1',
            id: 'architect-system',
            source: 'custom',
            prototype: 'architect',
            name: 'System Design Lead',
            promptExtension: 'Focus on boundaries, interface ownership, and migration sequencing.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 2_100,
            updatedAt: 2_200
        }]
        const deletedSnapshot = createSnapshot('review-requested')
        const client = {
            createTeamRole: vi.fn(async () => createdSnapshot.roles[2]),
            updateTeamRole: vi.fn(async () => updatedSnapshot.roles[2]),
            deleteTeamRole: vi.fn(async () => 'architect-system'),
            getTeamProject: vi
                .fn(async () => createdSnapshot)
                .mockResolvedValueOnce(createdSnapshot)
                .mockResolvedValueOnce(updatedSnapshot)
                .mockResolvedValueOnce(deletedSnapshot)
        } as unknown as ApiSessionClient

        const createRoleTool = findTool(managerContext, 'team_create_role')
        const updateRoleTool = findTool(managerContext, 'team_update_role')
        const deleteRoleTool = findTool(managerContext, 'team_delete_role')

        const createResult = await createRoleTool.execute({
            client,
            teamContext: managerContext
        }, {
            roleId: 'architect-system',
            prototype: 'architect',
            name: 'System Architect',
            promptExtension: 'Focus on boundaries and interface ownership.'
        })
        const updateResult = await updateRoleTool.execute({
            client,
            teamContext: managerContext
        }, {
            roleId: 'architect-system',
            name: 'System Design Lead',
            promptExtension: 'Focus on boundaries, interface ownership, and migration sequencing.'
        })
        const deleteResult = await deleteRoleTool.execute({
            client,
            teamContext: managerContext
        }, {
            roleId: 'architect-system'
        })

        expect(client.createTeamRole).toHaveBeenCalledWith('project-1', {
            managerSessionId: 'manager-session-1',
            roleId: 'architect-system',
            prototype: 'architect',
            name: 'System Architect',
            promptExtension: 'Focus on boundaries and interface ownership.'
        })
        expect(client.updateTeamRole).toHaveBeenCalledWith('project-1', 'architect-system', {
            managerSessionId: 'manager-session-1',
            name: 'System Design Lead',
            promptExtension: 'Focus on boundaries, interface ownership, and migration sequencing.',
            providerFlavor: undefined,
            model: undefined,
            reasoningEffort: undefined,
            isolationMode: undefined
        })
        expect(client.deleteTeamRole).toHaveBeenCalledWith('project-1', 'architect-system', {
            managerSessionId: 'manager-session-1'
        })
        const createdPayload = parseJsonResult(createResult)
        expect(createdPayload).toMatchObject({
            action: 'role_created',
            roleId: 'architect-system',
            role: {
                name: 'System Architect'
            }
        })
        expect(createdPayload.roles).toContainEqual(expect.objectContaining({ id: 'architect-system' }))
        expect(parseJsonResult(updateResult)).toMatchObject({
            action: 'role_updated',
            roleId: 'architect-system',
            role: {
                name: 'System Design Lead'
            }
        })
        expect(parseJsonResult(deleteResult)).toMatchObject({
            action: 'role_deleted',
            roleId: 'architect-system'
        })
    })

    it('uses the reviewer member identity from teamContext when submitting review results', async () => {
        const reviewerContext: SessionTeamContext = {
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: 'manager-session-1',
            memberId: 'member-reviewer',
            memberRole: 'reviewer',
            projectStatus: 'active'
        }
        const client = {
            submitTaskReviewResult: vi.fn(async () => createSnapshot('review-passed').tasks[0]),
            getTeamProject: vi.fn(async () => createSnapshot('review-passed'))
        } as unknown as ApiSessionClient
        const tool = findTool(reviewerContext, 'team_submit_review_result')

        const result = await tool.execute({
            client,
            teamContext: reviewerContext
        }, {
            taskId: 'task-1',
            decision: 'accept',
            summary: '回归风险可控，测试覆盖足够。'
        })

        expect(client.submitTaskReviewResult).toHaveBeenCalledWith('task-1', {
            memberId: 'member-reviewer',
            decision: 'accept',
            summary: '回归风险可控，测试覆盖足够。'
        })
        const payload = parseJsonResult(result)
        expect(payload.task.acceptance.reviewStatus).toBe('passed')
    })

    it('routes change_title through the summary message owner', async () => {
        const client = {
            sendClaudeSessionMessage: vi.fn()
        } as unknown as ApiSessionClient
        const tool = findTool(undefined, 'change_title')

        const result = await tool.execute({
            client,
            teamContext: undefined
        }, {
            title: 'Manager Teams Acceptance'
        })

        expect(client.sendClaudeSessionMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'summary',
            summary: 'Manager Teams Acceptance'
        }))
        expect(result).toEqual({
            content: [{
                type: 'text',
                text: 'Successfully changed chat title to: "Manager Teams Acceptance"'
            }],
            isError: false
        })
    })
})
