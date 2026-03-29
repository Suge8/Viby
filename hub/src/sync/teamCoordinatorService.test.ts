import { describe, expect, it } from 'bun:test'
import type { SyncEvent } from '@viby/protocol/types'
import { Store } from '../store'
import { TeamCoordinatorService } from './teamCoordinatorService'

function createTeamHarness() {
    const store = new Store(':memory:')
    const events: SyncEvent[] = []
    const coordinator = new TeamCoordinatorService(store, (event) => {
        events.push(event)
    })
    const managerSession = store.sessions.getOrCreateSession({
        tag: 'manager-session',
        metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex', name: 'Manager One' },
        agentState: null,
        model: 'gpt-5.4'
    })
    const memberSession = store.sessions.getOrCreateSession({
        tag: 'member-session',
        metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
        agentState: null,
        model: 'gpt-5.4'
    })

    return { store, events, coordinator, managerSession, memberSession }
}

describe('TeamCoordinatorService', () => {
    it('bootstraps manager projects once and reuses the authoritative project on repeated bootstrap', () => {
        const harness = createTeamHarness()
        const managerSession = {
            id: harness.managerSession.id,
            seq: 1,
            createdAt: 1_000,
            updatedAt: 1_000,
            active: false,
            activeAt: 1_000,
            metadata: {
                path: '/tmp/projects/manager-alpha',
                host: 'localhost',
                flavor: 'codex' as const,
                machineId: 'machine-1',
                name: 'Manager Alpha'
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            todos: undefined,
            teamContext: undefined,
            model: 'gpt-5.4',
            modelReasoningEffort: null,
            permissionMode: undefined,
            collaborationMode: undefined
        }

        const first = harness.coordinator.ensureManagerProject(managerSession)
        const second = harness.coordinator.ensureManagerProject(managerSession)

        expect(first.snapshot.project).toMatchObject({
            id: harness.managerSession.id,
            managerSessionId: harness.managerSession.id,
            machineId: 'machine-1',
            rootDirectory: '/tmp/projects/manager-alpha',
            title: 'Manager Alpha',
            status: 'active',
            maxActiveMembers: 6,
            defaultIsolationMode: 'hybrid'
        })
        expect(second.snapshot.project.id).toBe(first.snapshot.project.id)
        expect(harness.store.teams.listProjectEvents(harness.managerSession.id)).toHaveLength(1)
        expect(harness.events).toEqual([
            {
                type: 'session-updated',
                sessionId: harness.managerSession.id,
                data: { sid: harness.managerSession.id }
            },
            {
                type: 'team-project-updated',
                projectId: harness.managerSession.id,
                managerSessionId: harness.managerSession.id,
                affectedSessionIds: [harness.managerSession.id]
            }
        ])
    })

    it('persists durable team mutations through one typed command owner', () => {
        const harness = createTeamHarness()

        const projectResult = harness.coordinator.applyCommand({
            type: 'upsert-project',
            project: {
                id: 'project-1',
                managerSessionId: harness.managerSession.id,
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Manager Project',
                goal: 'Ship manager teams',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                createdAt: 1_000,
                updatedAt: 1_100,
                deliveredAt: null,
                archivedAt: null
            },
            event: {
                id: 'event-project-created',
                projectId: 'project-1',
                kind: 'project-created',
                actorType: 'manager',
                actorId: harness.managerSession.id,
                targetType: 'project',
                targetId: 'project-1',
                payload: null,
                createdAt: 1_100
            }
        })
        const memberResult = harness.coordinator.applyCommand({
            type: 'upsert-member',
            member: {
                id: 'member-1',
                projectId: 'project-1',
                sessionId: harness.memberSession.id,
                managerSessionId: harness.managerSession.id,
                role: 'implementer',
                roleId: 'implementer',
                providerFlavor: 'codex',
                model: 'gpt-5.4',
                reasoningEffort: 'high',
                isolationMode: 'worktree',
                workspaceRoot: '/tmp/project/worktrees/member-1',
                controlOwner: 'manager',
                membershipState: 'active',
                revision: 1,
                supersedesMemberId: null,
                supersededByMemberId: null,
                spawnedForTaskId: null,
                createdAt: 1_200,
                updatedAt: 1_300,
                archivedAt: null,
                removedAt: null
            },
            event: {
                id: 'event-member-spawned',
                projectId: 'project-1',
                kind: 'member-spawned',
                actorType: 'manager',
                actorId: harness.managerSession.id,
                targetType: 'member',
                targetId: 'member-1',
                payload: null,
                createdAt: 1_300
            }
        })

        expect(projectResult.snapshot.project.title).toBe('Manager Project')
        expect(memberResult.snapshot.members).toHaveLength(1)
        expect(memberResult.snapshot.events.map((event) => event.id)).toEqual([
            'event-member-spawned',
            'event-project-created'
        ])
        expect(memberResult.affectedSessionIds).toEqual([
            harness.managerSession.id,
            harness.memberSession.id
        ])
        expect(harness.events.filter((event) => event.type === 'session-updated')).toEqual([
            { type: 'session-updated', sessionId: harness.managerSession.id, data: { sid: harness.managerSession.id } },
            { type: 'session-updated', sessionId: harness.managerSession.id, data: { sid: harness.managerSession.id } },
            { type: 'session-updated', sessionId: harness.memberSession.id, data: { sid: harness.memberSession.id } }
        ])
        expect(harness.events.filter((event) => event.type === 'team-project-updated')).toEqual([
            {
                type: 'team-project-updated',
                projectId: 'project-1',
                managerSessionId: harness.managerSession.id,
                affectedSessionIds: [harness.managerSession.id]
            },
            {
                type: 'team-project-updated',
                projectId: 'project-1',
                managerSessionId: harness.managerSession.id,
                affectedSessionIds: [harness.managerSession.id, harness.memberSession.id]
            }
        ])
    })


    it('applies batch project and custom role replacement for preset imports', () => {
        const harness = createTeamHarness()

        harness.coordinator.applyCommand({
            type: 'upsert-project',
            project: {
                id: 'project-preset',
                managerSessionId: harness.managerSession.id,
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Preset Project',
                goal: 'Validate preset import batch semantics',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                createdAt: 1_000,
                updatedAt: 1_000,
                deliveredAt: null,
                archivedAt: null
            }
        })
        harness.coordinator.applyCommand({
            type: 'upsert-role',
            role: {
                projectId: 'project-preset',
                id: 'reviewer-legacy',
                source: 'custom',
                prototype: 'reviewer',
                name: 'Legacy Reviewer',
                promptExtension: 'Old role to be replaced.',
                providerFlavor: 'codex',
                model: 'gpt-5.4',
                reasoningEffort: 'high',
                isolationMode: 'simple',
                createdAt: 1_100,
                updatedAt: 1_100
            }
        })

        const result = harness.coordinator.applyCommand({
            type: 'batch',
            project: {
                id: 'project-preset',
                managerSessionId: harness.managerSession.id,
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Preset Project',
                goal: 'Validate preset import batch semantics',
                status: 'active',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple',
                createdAt: 1_000,
                updatedAt: 2_000,
                deliveredAt: null,
                archivedAt: null
            },
            roles: [{
                projectId: 'project-preset',
                id: 'reviewer-mobile',
                source: 'custom',
                prototype: 'reviewer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.',
                providerFlavor: 'codex',
                model: 'gpt-5.4',
                reasoningEffort: 'high',
                isolationMode: 'simple',
                createdAt: 2_000,
                updatedAt: 2_000
            }],
            deletedRoleIds: ['reviewer-legacy']
        })

        expect(result.snapshot.project).toMatchObject({
            id: 'project-preset',
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        })
        expect(result.snapshot.roles.some((role) => role.id === 'reviewer-mobile')).toBe(true)
        expect(result.snapshot.roles.some((role) => role.id === 'reviewer-legacy')).toBe(false)
    })

    it('keeps acceptance read-model durable even when generic project history truncates older acceptance events', () => {
        const harness = createTeamHarness()

        harness.coordinator.applyCommand({
            type: 'upsert-project',
            project: {
                id: 'project-acceptance',
                managerSessionId: harness.managerSession.id,
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Acceptance Project',
                goal: 'Verify durable acceptance state',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                createdAt: 1_000,
                updatedAt: 1_000,
                deliveredAt: null,
                archivedAt: null
            }
        })
        harness.coordinator.applyCommand({
            type: 'upsert-task',
            task: {
                id: 'task-acceptance',
                projectId: 'project-acceptance',
                parentTaskId: null,
                title: 'Hold acceptance state',
                description: null,
                acceptanceCriteria: 'Keep the review result durable',
                status: 'in_verification',
                assigneeMemberId: null,
                reviewerMemberId: null,
                verifierMemberId: null,
                priority: 'high',
                dependsOn: [],
                retryCount: 0,
                createdAt: 1_000,
                updatedAt: 1_001,
                completedAt: null
            }
        })
        harness.coordinator.applyCommand({
            type: 'record-event',
            event: {
                id: 'event-review-passed',
                projectId: 'project-acceptance',
                kind: 'review-passed',
                actorType: 'member',
                actorId: 'member-reviewer',
                targetType: 'task',
                targetId: 'task-acceptance',
                payload: {
                    summary: 'Review passed early'
                },
                createdAt: 1_100
            }
        })

        for (let index = 0; index < 60; index += 1) {
            harness.coordinator.applyCommand({
                type: 'record-event',
                event: {
                    id: `event-comment-${index}`,
                    projectId: 'project-acceptance',
                    kind: 'task-commented',
                    actorType: 'manager',
                    actorId: harness.managerSession.id,
                    targetType: 'task',
                    targetId: 'task-acceptance',
                    payload: {
                        comment: `comment ${index}`
                    },
                    createdAt: 2_000 + index
                }
            })
        }

        const snapshot = harness.coordinator.getProjectSnapshot('project-acceptance')
        expect(snapshot).not.toBeNull()
        if (!snapshot) {
            throw new Error('Expected project snapshot')
        }

        expect(snapshot.events).toHaveLength(50)
        expect(snapshot.events.some((event) => event.id === 'event-review-passed')).toBe(false)
        expect(snapshot.acceptance.tasks['task-acceptance']).toMatchObject({
            reviewStatus: 'passed',
            verificationStatus: 'idle',
            managerAccepted: false,
            skipVerificationReason: null
        })
        expect(snapshot.acceptance.recentResults).toEqual([
            expect.objectContaining({
                id: 'event-review-passed',
                kind: 'review-passed'
            })
        ])
    })

})
