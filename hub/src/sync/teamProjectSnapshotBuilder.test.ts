import { describe, expect, it } from 'bun:test'
import { createBuiltInTeamRoleDefinition } from '@viby/protocol'
import type {
    TeamEventRecord,
    TeamMemberRecord,
    TeamProject,
    TeamRoleDefinition,
    TeamTaskRecord,
} from '@viby/protocol/types'
import { Store } from '../store'
import { buildTeamProjectSnapshot } from './teamProjectSnapshotBuilder'

function createProject(overrides?: Partial<TeamProject>): TeamProject {
    return {
        id: 'project-1',
        managerSessionId: 'manager-session-1',
        machineId: 'machine-1',
        rootDirectory: '/tmp/project',
        title: 'Manager Project',
        goal: 'Ship manager autonomy',
        status: 'active',
        maxActiveMembers: 6,
        defaultIsolationMode: 'hybrid',
        createdAt: 1_000,
        updatedAt: 1_000,
        deliveredAt: null,
        archivedAt: null,
        ...overrides,
    }
}

function createMember(overrides?: Partial<TeamMemberRecord>): TeamMemberRecord {
    return {
        id: 'member-1',
        projectId: 'project-1',
        sessionId: 'member-session-1',
        managerSessionId: 'manager-session-1',
        role: 'implementer',
        roleId: 'implementer',
        providerFlavor: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: 'worktree',
        workspaceRoot: '/tmp/project/worktrees/member-1',
        controlOwner: 'manager',
        membershipState: 'active',
        revision: 2,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: null,
        createdAt: 1_000,
        updatedAt: 1_100,
        archivedAt: null,
        removedAt: null,
        ...overrides,
    }
}

function createTask(overrides?: Partial<TeamTaskRecord>): TeamTaskRecord {
    return {
        id: 'task-1',
        projectId: 'project-1',
        parentTaskId: null,
        title: 'Default team task',
        description: null,
        acceptanceCriteria: 'Ship it',
        status: 'running',
        assigneeMemberId: 'member-1',
        reviewerMemberId: null,
        verifierMemberId: null,
        priority: 'high',
        dependsOn: [],
        retryCount: 0,
        createdAt: 1_000,
        updatedAt: 1_100,
        completedAt: null,
        ...overrides,
    }
}

function createCustomRole(overrides?: Partial<TeamRoleDefinition>): TeamRoleDefinition {
    return {
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
        createdAt: 1_000,
        updatedAt: 1_000,
        ...overrides,
    }
}

function createEvent(overrides: Partial<TeamEventRecord> & Pick<TeamEventRecord, 'id' | 'kind'>): TeamEventRecord {
    const { id, kind, ...rest } = overrides

    return {
        projectId: 'project-1',
        id,
        kind,
        actorType: 'manager',
        actorId: 'manager-session-1',
        targetType: 'task',
        targetId: 'task-1',
        payload: null,
        createdAt: 1_100,
        ...rest,
    }
}

function createStore(): Store {
    const store = new Store(':memory:')
    store.sessions.getOrCreateSession({
        tag: 'manager-session',
        sessionId: 'manager-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            name: 'Manager Session',
        },
        agentState: null,
        model: 'gpt-5.4',
    })
    store.sessions.getOrCreateSession({
        tag: 'member-session',
        sessionId: 'member-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            name: 'Member Session',
        },
        agentState: null,
        model: 'gpt-5.4',
    })
    return store
}

function upsertProjectWithRoles(store: Store, project: TeamProject): void {
    store.teams.upsertProject(project)
    for (const prototype of ['implementer', 'reviewer', 'verifier'] as const) {
        store.teams.upsertRole(createBuiltInTeamRoleDefinition(project.id, prototype, project.createdAt))
    }
}

describe('buildTeamProjectSnapshot', () => {
    it('derives compact wake reasons and next actions from authoritative durable facts', () => {
        const store = createStore()
        upsertProjectWithRoles(store, createProject())
        store.teams.upsertMember(createMember())
        store.sessions.setSessionAlive('member-session-1', 1_150)
        store.teams.upsertTask(createTask({
            id: 'task-blocked',
            title: 'Unblock build pipeline',
            status: 'blocked',
            updatedAt: 1_200,
        }))
        store.teams.upsertTask(createTask({
            id: 'task-review-failed',
            title: 'Fix review findings',
            status: 'in_review',
            updatedAt: 1_210,
        }))
        store.teams.upsertTask(createTask({
            id: 'task-verification-failed',
            title: 'Fix failing smoke test',
            status: 'in_verification',
            updatedAt: 1_220,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-review-failed',
            kind: 'review-failed',
            actorType: 'member',
            actorId: 'member-reviewer',
            targetId: 'task-review-failed',
            payload: {
                summary: 'Reviewer found a regression.',
            },
            createdAt: 1_300,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-review-passed',
            kind: 'review-passed',
            actorType: 'member',
            actorId: 'member-reviewer',
            targetId: 'task-verification-failed',
            payload: {
                summary: 'Review passed before verification.',
            },
            createdAt: 1_310,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-verification-failed',
            kind: 'verification-failed',
            actorType: 'member',
            actorId: 'member-verifier',
            targetId: 'task-verification-failed',
            payload: {
                summary: 'Smoke test failed on mobile.',
            },
            createdAt: 1_320,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-user-interjected',
            kind: 'user-interjected',
            actorType: 'user',
            actorId: null,
            targetType: 'member',
            targetId: 'member-1',
            payload: {
                summary: 'User changed the plan.',
            },
            createdAt: 1_330,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-member-replaced',
            kind: 'member-replaced',
            targetType: 'member',
            targetId: 'member-1',
            payload: {
                reason: 'provider_flavor_changed',
            },
            createdAt: 1_340,
        }))

        const snapshot = buildTeamProjectSnapshot(store, 'project-1')

        expect(snapshot).not.toBeNull()
        if (!snapshot) {
            throw new Error('Expected team project snapshot')
        }

        expect(snapshot.compactBrief.counts).toMatchObject({
            activeMemberCount: 1,
            inactiveMemberCount: 0,
            openTaskCount: 3,
            blockedTaskCount: 1,
            reviewFailedTaskCount: 1,
            verificationFailedTaskCount: 1,
            readyForManagerAcceptanceCount: 0,
            deliveryReady: false,
        })
        expect(snapshot.compactBrief.wakeReasons).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'blocked-task',
                taskId: 'task-blocked',
            }),
            expect.objectContaining({
                kind: 'review-failed',
                taskId: 'task-review-failed',
                eventId: 'event-review-failed',
            }),
            expect.objectContaining({
                kind: 'verification-failed',
                taskId: 'task-verification-failed',
                eventId: 'event-verification-failed',
            }),
            expect.objectContaining({
                kind: 'user-interjected',
                memberId: 'member-1',
                eventId: 'event-user-interjected',
            }),
            expect.objectContaining({
                kind: 'member-session-drift',
                memberId: 'member-1',
                eventId: 'event-member-replaced',
            }),
        ]))
        expect(snapshot.compactBrief.staffing).toMatchObject({
            seatPressure: 'available',
            remainingMemberSlots: 5,
            hints: expect.arrayContaining([
                expect.objectContaining({
                    kind: 'spawn-new-member',
                    taskId: 'task-blocked',
                    roleId: 'implementer',
                    memberId: 'member-1',
                    launchStrategy: 'spawn',
                }),
                expect.objectContaining({
                    kind: 'spawn-new-member',
                    taskId: 'task-review-failed',
                    roleId: 'reviewer',
                    memberId: null,
                    launchStrategy: 'spawn',
                }),
                expect.objectContaining({
                    kind: 'spawn-new-member',
                    taskId: 'task-verification-failed',
                    roleId: 'verifier',
                    memberId: null,
                    launchStrategy: 'spawn',
                }),
            ]),
        })
        expect(snapshot.compactBrief.nextActions).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'replan-blocked-task',
                taskId: 'task-blocked',
                wakeReasonKind: 'blocked-task',
            }),
            expect.objectContaining({
                kind: 'revise-failed-task',
                taskId: 'task-review-failed',
                wakeReasonKind: 'review-failed',
            }),
            expect.objectContaining({
                kind: 'revise-failed-task',
                taskId: 'task-verification-failed',
                wakeReasonKind: 'verification-failed',
            }),
            expect.objectContaining({
                kind: 'inspect-user-change',
                memberId: 'member-1',
                wakeReasonKind: 'user-interjected',
            }),
            expect.objectContaining({
                kind: 'inspect-member-session',
                memberId: 'member-1',
                wakeReasonKind: 'member-session-drift',
            }),
            expect.objectContaining({
                kind: 'resolve-staffing',
                taskId: 'task-blocked',
                memberId: 'member-1',
            }),
            expect.objectContaining({
                kind: 'resolve-staffing',
                taskId: 'task-review-failed',
                memberId: null,
            }),
            expect.objectContaining({
                kind: 'resolve-staffing',
                taskId: 'task-verification-failed',
                memberId: null,
            }),
        ]))
    })

    it('surfaces authoritative custom role labels in compact wake summaries', () => {
        const store = createStore()
        upsertProjectWithRoles(store, createProject())
        store.sessions.getOrCreateSession({
            tag: 'member-session-reviewer',
            sessionId: 'member-session-2',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'codex',
                name: 'Reviewer Session',
            },
            agentState: null,
            model: 'gpt-5.4',
        })
        store.teams.upsertRole(createCustomRole())
        store.teams.upsertMember(createMember({
            id: 'member-2',
            sessionId: 'member-session-2',
            role: 'reviewer',
            roleId: 'mobile-reviewer',
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-user-interjected-custom-reviewer',
            kind: 'user-interjected',
            actorType: 'user',
            actorId: null,
            targetType: 'member',
            targetId: 'member-2',
            payload: null,
            createdAt: 1_250,
        }))

        const snapshot = buildTeamProjectSnapshot(store, 'project-1')

        expect(snapshot).not.toBeNull()
        if (!snapshot) {
            throw new Error('Expected team project snapshot')
        }

        expect(snapshot.compactBrief.recentEvents).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'event-user-interjected-custom-reviewer',
                summary: 'User interjected on Mobile Reviewer (reviewer) r2.'
            })
        ]))
        expect(snapshot.compactBrief.wakeReasons).toEqual(expect.arrayContaining([
            expect.objectContaining({
                kind: 'user-interjected',
                summary: 'User interjected on Mobile Reviewer (reviewer) r2.'
            })
        ]))
    })

    it('marks projects as ready to deliver only from authoritative acceptance state', () => {
        const store = createStore()
        upsertProjectWithRoles(store, createProject({
            id: 'project-delivery',
            updatedAt: 2_000,
        }))
        store.teams.upsertTask(createTask({
            id: 'task-deliver',
            projectId: 'project-delivery',
            title: 'Ship final output',
            status: 'done',
            assigneeMemberId: null,
            updatedAt: 2_100,
            completedAt: 2_100,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-review-passed',
            projectId: 'project-delivery',
            kind: 'review-passed',
            actorType: 'member',
            actorId: 'member-reviewer',
            targetId: 'task-deliver',
            payload: {
                summary: 'Review passed.'
            },
            createdAt: 2_050,
        }))
        store.teams.insertEvent(createEvent({
            id: 'event-verification-passed',
            projectId: 'project-delivery',
            kind: 'verification-passed',
            actorType: 'member',
            actorId: 'member-verifier',
            targetId: 'task-deliver',
            payload: {
                summary: 'Verification passed.'
            },
            createdAt: 2_075,
        }))

        const beforeAcceptance = buildTeamProjectSnapshot(store, 'project-delivery')

        expect(beforeAcceptance).not.toBeNull()
        if (!beforeAcceptance) {
            throw new Error('Expected pre-acceptance delivery snapshot')
        }

        expect(beforeAcceptance.compactBrief.counts.deliveryReady).toBe(false)
        expect(beforeAcceptance.compactBrief.summary).not.toContain('ready to deliver')

        store.teams.insertEvent(createEvent({
            id: 'event-manager-accepted',
            projectId: 'project-delivery',
            kind: 'manager-accepted',
            targetId: 'task-deliver',
            payload: {
                summary: 'Final acceptance passed.',
            },
            createdAt: 2_100,
        }))

        const snapshot = buildTeamProjectSnapshot(store, 'project-delivery')

        expect(snapshot).not.toBeNull()
        if (!snapshot) {
            throw new Error('Expected delivery snapshot')
        }

        expect(snapshot.compactBrief.counts).toMatchObject({
            openTaskCount: 0,
            deliveryReady: true,
        })
        expect(snapshot.compactBrief.staffing).toEqual({
            seatPressure: 'available',
            remainingMemberSlots: 6,
            hints: []
        })
        expect(snapshot.compactBrief.wakeReasons).toEqual([
            expect.objectContaining({
                kind: 'ready-to-deliver',
                taskId: null,
                memberId: null,
            }),
        ])
        expect(snapshot.compactBrief.nextActions).toEqual([
            expect.objectContaining({
                kind: 'deliver-project',
                wakeReasonKind: 'ready-to-deliver',
            }),
        ])
        expect(snapshot.compactBrief.summary).toContain('ready to deliver')
    })
})
