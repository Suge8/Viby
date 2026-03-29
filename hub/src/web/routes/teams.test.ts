import { describe, expect, it } from 'bun:test'
import { TEAM_PRESET_SCHEMA_VERSION } from '@viby/protocol'
import { Hono } from 'hono'
import type {
    Session,
    TeamProjectSnapshot,
    TeamTaskRecord
} from '@viby/protocol/types'
import {
    SessionSendMessageError,
    TeamAcceptanceError,
    TeamMemberControlError,
    TeamOrchestrationError,
    type SyncEngine
} from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createTeamsRoutes } from './teams'

function createSession(id: string): Session {
    return {
        id,
        seq: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        active: true,
        activeAt: 1_000,
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1_000,
        todos: undefined,
        teamContext: undefined,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'default'
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
        roles: [],
        members: [],
        tasks: [],
        events: [],
        acceptance: {
            tasks: {},
            recentResults: []
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
            summary: 'Project "Manager Project" has 0 active members, 0 open tasks.',
            counts: {
                activeMemberCount: 0,
                inactiveMemberCount: 0,
                openTaskCount: 0,
                blockedTaskCount: 0,
                reviewFailedTaskCount: 0,
                verificationFailedTaskCount: 0,
                readyForManagerAcceptanceCount: 0,
                deliveryReady: false
            },
            staffing: {
                seatPressure: 'available',
                remainingMemberSlots: 6,
                hints: []
            },
            activeMembers: [],
            inactiveMembers: [],
            openTasks: [],
            recentEvents: [],
            recentAcceptanceResults: [],
            wakeReasons: [],
            nextActions: []
        }
    }
}

function createTask(status: TeamTaskRecord['status'] = 'in_review'): TeamTaskRecord {
    return {
        id: 'task-1',
        projectId: 'project-1',
        parentTaskId: null,
        title: 'Review this change',
        description: null,
        acceptanceCriteria: 'Tests pass',
        status,
        assigneeMemberId: 'member-implementer',
        reviewerMemberId: 'member-reviewer',
        verifierMemberId: 'member-verifier',
        priority: 'high',
        dependsOn: [],
        retryCount: 0,
        createdAt: 1_000,
        updatedAt: 2_000,
        completedAt: status === 'done' ? 2_000 : null
    }
}


function createPreset() {
    return {
        schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
        projectSettings: {
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple' as const
        },
        roles: [{
            id: 'reviewer-mobile',
            prototype: 'reviewer' as const,
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex' as const,
            model: 'gpt-5.4',
            reasoningEffort: 'high' as const,
            isolationMode: 'simple' as const
        }]
    }
}

describe('teams routes', () => {
    it('returns the authoritative team project snapshot', async () => {
        const engine = {
            getTeamProjectSnapshot: (projectId: string) => {
                expect(projectId).toBe('project-1')
                return createSnapshot()
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(createSnapshot())
    })

    it('returns the dedicated team history payload for lazy history surfaces', async () => {
        const history = {
            projectId: 'project-1',
            events: [{
                id: 'event-member-archived',
                projectId: 'project-1',
                kind: 'member-archived',
                actorType: 'user',
                actorId: null,
                targetType: 'member',
                targetId: 'member-1',
                payload: null,
                createdAt: 2_000
            }]
        }
        const engine = {
            getTeamProjectHistory: (projectId: string) => {
                expect(projectId).toBe('project-1')
                return history
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/history')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(history)
    })

    it('updates project settings through the dedicated authoritative owner', async () => {
        const calls: Array<unknown> = []
        const engine = {
            updateTeamProjectSettings: async (input: unknown) => {
                calls.push(input)
                return {
                    ...createSnapshot(),
                    project: {
                        ...createSnapshot().project,
                        maxActiveMembers: 4,
                        defaultIsolationMode: 'all_simple' as const
                    }
                }
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/settings', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            project: {
                id: 'project-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            }
        })
        expect(calls).toEqual([{
            managerSessionId: 'manager-session-1',
            projectId: 'project-1',
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        }])
    })

    it('rejects generic task mutations that try to mark work done directly', async () => {
        const engine = {
            createTeamTask: async () => {
                throw new Error('should not reach createTeamTask')
            },
            updateTeamTask: async () => {
                throw new Error('should not reach updateTeamTask')
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const createResponse = await app.request('/api/team-tasks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                title: 'Bypass acceptance',
                status: 'done'
            })
        })
        const updateResponse = await app.request('/api/team-tasks/task-1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                status: 'done'
            })
        })

        expect(createResponse.status).toBe(400)
        expect(updateResponse.status).toBe(400)
    })


    it('forwards role catalog create, update, and delete through the dedicated manager owner', async () => {
        const calls: Array<unknown> = []
        const createdRole = {
            projectId: 'project-1',
            id: 'reviewer-mobile',
            source: 'custom' as const,
            prototype: 'reviewer' as const,
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex' as const,
            model: 'gpt-5.4',
            reasoningEffort: 'high' as const,
            isolationMode: 'simple' as const,
            createdAt: 2_100,
            updatedAt: 2_100
        }
        const updatedRole = {
            ...createdRole,
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
            updatedAt: 2_200
        }
        const engine = {
            createTeamRole: async (input: unknown) => {
                calls.push({ action: 'create', input })
                return createdRole
            },
            updateTeamRole: async (input: unknown) => {
                calls.push({ action: 'update', input })
                return updatedRole
            },
            deleteTeamRole: async (input: unknown) => {
                calls.push({ action: 'delete', input })
                return 'reviewer-mobile'
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const createResponse = await app.request('/api/team-projects/project-1/roles', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                roleId: 'reviewer-mobile',
                prototype: 'reviewer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.'
            })
        })
        const updateResponse = await app.request('/api/team-projects/project-1/roles/reviewer-mobile', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                name: 'Mobile Review Lead',
                promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
            })
        })
        const deleteResponse = await app.request('/api/team-projects/project-1/roles/reviewer-mobile', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1'
            })
        })

        expect(createResponse.status).toBe(200)
        expect(await createResponse.json()).toEqual({
            ok: true,
            role: createdRole
        })
        expect(updateResponse.status).toBe(200)
        expect(await updateResponse.json()).toEqual({
            ok: true,
            role: updatedRole
        })
        expect(deleteResponse.status).toBe(200)
        expect(await deleteResponse.json()).toEqual({
            ok: true,
            roleId: 'reviewer-mobile'
        })
        expect(calls).toEqual([{
            action: 'create',
            input: {
                managerSessionId: 'manager-session-1',
                projectId: 'project-1',
                roleId: 'reviewer-mobile',
                prototype: 'reviewer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.'
            }
        }, {
            action: 'update',
            input: {
                managerSessionId: 'manager-session-1',
                projectId: 'project-1',
                roleId: 'reviewer-mobile',
                name: 'Mobile Review Lead',
                promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
            }
        }, {
            action: 'delete',
            input: {
                managerSessionId: 'manager-session-1',
                projectId: 'project-1',
                roleId: 'reviewer-mobile'
            }
        }])
    })


    it('exports project presets through the dedicated bootstrap document owner', async () => {
        const calls: Array<unknown> = []
        const preset = createPreset()
        const engine = {
            getTeamProjectSnapshot: (projectId: string) => {
                expect(projectId).toBe('project-1')
                return createSnapshot()
            },
            exportTeamProjectPreset: async (input: unknown) => {
                calls.push(input)
                return preset
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/preset')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(preset)
        expect(calls).toEqual([{
            managerSessionId: 'manager-session-1',
            projectId: 'project-1'
        }])
    })

    it('imports project presets through the dedicated bootstrap document owner', async () => {
        const calls: Array<unknown> = []
        const preset = createPreset()
        const engine = {
            importTeamProjectPreset: async (input: unknown) => {
                calls.push(input)
                return {
                    ...createSnapshot(),
                    project: {
                        ...createSnapshot().project,
                        maxActiveMembers: 4,
                        defaultIsolationMode: 'all_simple' as const
                    },
                    roles: [{
                        projectId: 'project-1',
                        id: 'reviewer-mobile',
                        source: 'custom' as const,
                        prototype: 'reviewer' as const,
                        name: 'Mobile Reviewer',
                        promptExtension: 'Focus on mobile regressions.',
                        providerFlavor: 'codex' as const,
                        model: 'gpt-5.4',
                        reasoningEffort: 'high' as const,
                        isolationMode: 'simple' as const,
                        createdAt: 2_000,
                        updatedAt: 2_000
                    }],
                }
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/preset', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                preset
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            project: {
                id: 'project-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            },
            roles: [expect.objectContaining({ id: 'reviewer-mobile' })]
        })
        expect(calls).toEqual([{
            managerSessionId: 'manager-session-1',
            projectId: 'project-1',
            preset
        }])
    })

    it('forwards interject through a single Hub-owned action', async () => {
        const calls: Array<{ memberId: string; text: string; localId?: string }> = []
        const session = createSession('member-session-1')
        const engine = {
            interjectTeamMember: async (memberId: string, payload: { text: string; localId?: string }) => {
                calls.push({ memberId, text: payload.text, localId: payload.localId })
                return session
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-members/member-1/interject', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                text: 'please check the failing test',
                localId: 'local-1'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            session
        })
        expect(calls).toEqual([{
            memberId: 'member-1',
            text: 'please check the failing test',
            localId: 'local-1'
        }])
    })

    it('surfaces team control errors from takeover', async () => {
        const engine = {
            takeOverTeamMember: async () => {
                throw new TeamMemberControlError(
                    'Team member is not active',
                    'team_member_inactive',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-members/member-1/takeover', {
            method: 'POST'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Team member is not active',
            code: 'team_member_inactive'
        })
    })

    it('surfaces passive wake errors from takeover through the shared team route handler', async () => {
        const engine = {
            takeOverTeamMember: async () => {
                throw new SessionSendMessageError(
                    'No machine online',
                    'no_machine_online',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-members/member-1/takeover', {
            method: 'POST'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'No machine online',
            code: 'no_machine_online'
        })
    })

    it('surfaces orchestration errors from project settings updates', async () => {
        const engine = {
            updateTeamProjectSettings: async () => {
                throw new TeamOrchestrationError(
                    'Team project is not active',
                    'team_project_inactive',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/settings', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Team project is not active',
            code: 'team_project_inactive'
        })
    })

    it('forwards review-request through the dedicated acceptance owner', async () => {
        const calls: Array<unknown> = []
        const task = createTask('in_review')
        const engine = {
            requestTaskReview: async (input: unknown) => {
                calls.push(input)
                return task
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-tasks/task-1/review-request', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                reviewerMemberId: 'member-reviewer',
                note: '重点看 diff'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            task
        })
        expect(calls).toEqual([{
            managerSessionId: 'manager-session-1',
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer',
            note: '重点看 diff'
        }])
    })

    it('surfaces acceptance control conflicts from review-request', async () => {
        const engine = {
            requestTaskReview: async () => {
                throw new TeamAcceptanceError(
                    'Team member is currently under user control',
                    'team_member_control_conflict',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-tasks/task-1/review-request', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                reviewerMemberId: 'member-reviewer'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Team member is currently under user control',
            code: 'team_member_control_conflict'
        })
    })

    it('surfaces passive wake lifecycle errors from review-result through the shared team route handler', async () => {
        const engine = {
            submitTaskReviewResult: async () => {
                throw new SessionSendMessageError(
                    'No machine online',
                    'no_machine_online',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-tasks/task-1/review-result', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                memberId: 'member-reviewer',
                decision: 'request_changes',
                summary: 'wake should fail hard'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'No machine online',
            code: 'no_machine_online'
        })
    })

    it('surfaces acceptance errors from final accept', async () => {
        const engine = {
            acceptTeamTask: async () => {
                throw new TeamAcceptanceError(
                    'Verification must pass before final acceptance, unless skipped explicitly',
                    'team_verification_required',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-tasks/task-1/accept', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Verification must pass before final acceptance, unless skipped explicitly',
            code: 'team_verification_required'
        })
    })

    it('forwards orchestration member spawn through the dedicated manager owner', async () => {
        const calls: Array<unknown> = []
        const session = createSession('member-session-2')
        const engine = {
            spawnTeamMember: async (input: unknown) => {
                calls.push(input)
                return {
                    member: {
                        id: 'member-2',
                        projectId: 'project-1',
                        sessionId: session.id,
                        managerSessionId: 'manager-session-1',
                        role: 'implementer',
                        roleId: 'implementer',
                        providerFlavor: 'codex',
                        model: 'gpt-5.4',
                        reasoningEffort: 'high',
                        isolationMode: 'worktree',
                        workspaceRoot: '/tmp/project-worktrees/member-2',
                        controlOwner: 'manager',
                        membershipState: 'active',
                        revision: 1,
                        supersedesMemberId: null,
                        supersededByMemberId: null,
                        spawnedForTaskId: 'task-1',
                        createdAt: 2_000,
                        updatedAt: 2_000,
                        archivedAt: null,
                        removedAt: null
                    },
                    session,
                    launch: {
                        strategy: 'spawn',
                        reason: 'no_prior_member',
                        previousMemberId: null
                    }
                }
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-members', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1',
                roleId: 'implementer',
                taskId: 'task-1'
            })
        })

        expect(response.status).toBe(200)
        expect(calls).toEqual([{
            managerSessionId: 'manager-session-1',
            roleId: 'implementer',
            taskId: 'task-1'
        }])
        expect(await response.json()).toEqual({
            ok: true,
            member: expect.objectContaining({
                id: 'member-2',
                role: 'implementer'
            }),
            session,
            launch: {
                strategy: 'spawn',
                reason: 'no_prior_member',
                previousMemberId: null
            }
        })
    })

    it('surfaces orchestration errors from project close', async () => {
        const engine = {
            closeTeamProject: async () => {
                throw new TeamOrchestrationError(
                    'Project still has open team tasks',
                    'team_project_close_blocked',
                    409
                )
            }
        } as unknown as SyncEngine

        const app = new Hono<WebAppEnv>()
        app.route('/api', createTeamsRoutes(() => engine))

        const response = await app.request('/api/team-projects/project-1/close', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                managerSessionId: 'manager-session-1'
            })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Project still has open team tasks',
            code: 'team_project_close_blocked'
        })
    })
})
