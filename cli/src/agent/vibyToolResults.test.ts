import { describe, expect, it } from 'vitest'
import type { TeamProjectSnapshot } from '@viby/protocol/types'
import {
    summarizeTaskAction,
    summarizeTeamSnapshot
} from './vibyToolResults'

function createCompactStaffing(): TeamProjectSnapshot['compactBrief']['staffing'] {
    return {
        seatPressure: 'available',
        remainingMemberSlots: 5,
        hints: []
    }
}

function createSnapshot(): TeamProjectSnapshot {
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
            createdAt: 1_100,
            updatedAt: 1_200
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
            createdAt: 1_150,
            updatedAt: 1_250,
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
        events: [{
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
        }],
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
            summary: 'Project "Manager Project" has 1 active members, 1 open tasks, 1 awaiting manager acceptance.',
            counts: {
                activeMemberCount: 1,
                inactiveMemberCount: 0,
                openTaskCount: 1,
                blockedTaskCount: 0,
                reviewFailedTaskCount: 0,
                verificationFailedTaskCount: 0,
                readyForManagerAcceptanceCount: 1,
                deliveryReady: false
            },
            staffing: createCompactStaffing(),
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
                updatedAt: 1_250
            }],
            inactiveMembers: [],
            openTasks: [{
                id: 'task-1',
                title: 'Ship acceptance chain',
                status: 'in_verification',
                priority: 'high',
                assigneeMemberId: 'member-implementer',
                reviewerMemberId: 'member-reviewer',
                verifierMemberId: 'member-verifier',
                retryCount: 0,
                updatedAt: 2_000,
                acceptance: {
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
                    }
                }
            }],
            recentEvents: [{
                id: 'event-verification-passed',
                kind: 'verification-passed',
                targetId: 'task-1',
                createdAt: 2_000,
                summary: 'focused tests 和 smoke 都通过。'
            }],
            recentAcceptanceResults: [{
                id: 'event-verification-passed',
                kind: 'verification-passed',
                targetId: 'task-1',
                createdAt: 2_000,
                summary: 'focused tests 和 smoke 都通过。'
            }],
            wakeReasons: [],
            nextActions: [{
                kind: 'perform-manager-acceptance',
                summary: 'Perform manager acceptance for task "Ship acceptance chain".',
                taskId: 'task-1',
                memberId: 'member-implementer',
                wakeReasonKind: null
            }]
        }
    }
}

describe('vibyToolResults', () => {
    it('summarizes the authoritative role catalog and member role ids', () => {
        const summary = summarizeTeamSnapshot(createSnapshot())

        expect(summary.roles).toEqual([expect.objectContaining({
            id: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer'
        })])
        expect(summary.compactBrief).toMatchObject({
            project: {
                title: 'Manager Project'
            },
            counts: {
                readyForManagerAcceptanceCount: 1
            },
            nextActions: [expect.objectContaining({
                kind: 'perform-manager-acceptance'
            })]
        })

        const actionSummary = summarizeTaskAction('team_request_review', 'task-1', createSnapshot())
        expect(actionSummary).toMatchObject({
            action: 'team_request_review',
            roles: [expect.objectContaining({
                id: 'reviewer-mobile'
            })],
            task: {
                id: 'task-1',
                acceptance: {
                    latestEvent: {
                        kind: 'verification-passed'
                    }
                }
            }
        })
    })

    it('surfaces authoritative skipVerificationReason in task action summaries', () => {
        const snapshot = createSnapshot()
        snapshot.acceptance.tasks['task-1'] = {
            ...snapshot.acceptance.tasks['task-1'],
            verificationStatus: 'idle',
            managerAccepted: true,
            skipVerificationReason: '纯 design exploration，显式跳过 verifier。',
        }
        snapshot.tasks[0] = {
            ...snapshot.tasks[0],
            status: 'done',
            completedAt: 2_100,
        }

        expect(summarizeTaskAction('team_accept_task', 'task-1', snapshot)).toMatchObject({
            task: {
                id: 'task-1',
                acceptance: {
                    managerAccepted: true,
                    skipVerificationReason: '纯 design exploration，显式跳过 verifier。'
                }
            }
        })
    })

    it('throws when a task action is missing the authoritative acceptance read model', () => {
        const snapshot = createSnapshot()
        snapshot.acceptance.tasks = {}

        expect(() => summarizeTaskAction('team_request_review', 'task-1', snapshot)).toThrow(
            'Missing authoritative acceptance record for team task task-1'
        )
    })
})
