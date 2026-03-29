import { describe, expect, it } from 'bun:test'
import { TEAM_PRESET_SCHEMA_VERSION } from '@viby/protocol'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SyncEngine } from './syncEngine'

function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {
                        }
                    }
                }
            }
        }
    } as unknown as Server
}

function createHarness() {
    const store = new Store(':memory:')
    const engine = new SyncEngine(
        store,
        createIoStub(),
        {} as RpcRegistry,
        { broadcast() {} }
    )
    const managerSession = engine.getOrCreateSession({
        tag: 'orchestration-manager',
        sessionId: 'manager-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            machineId: 'machine-1',
            name: 'Manager'
        },
        agentState: null,
        model: 'gpt-5.4',
        sessionRole: 'manager'
    })
    engine.handleSessionAlive({
        sid: managerSession.id,
        time: Date.now()
    })

    engine.spawnSession = (async (options: Parameters<SyncEngine['spawnSession']>[0]) => {
        const sessionId = options.sessionId ?? crypto.randomUUID()
        const worktreePath = options.sessionType === 'worktree'
            ? `/tmp/project-worktrees/${options.worktreeName ?? 'member'}`
            : options.directory
        const session = engine.getOrCreateSession({
            tag: `spawned-${sessionId}`,
            sessionId,
            metadata: {
                path: worktreePath,
                host: 'localhost',
                flavor: options.agent ?? 'codex',
                machineId: options.machineId
            },
            agentState: null,
            model: options.model,
            modelReasoningEffort: options.modelReasoningEffort ?? undefined
        })
        engine.handleSessionAlive({
            sid: session.id,
            time: Date.now()
        })
        return {
            type: 'success',
            sessionId
        }
    }) as SyncEngine['spawnSession']

    return {
        store,
        engine,
        managerSession
    }
}

function createMember(harness: ReturnType<typeof createHarness>, options: {
    id: string
    sessionId: string
    role: 'implementer' | 'reviewer' | 'verifier'
    flavor?: 'codex' | 'claude'
    model?: string
    isolationMode?: 'simple' | 'worktree'
    workspaceRoot?: string | null
    membershipState?: 'active' | 'archived'
    revision?: number
    spawnedForTaskId?: string | null
    codexSessionId?: string
    active?: boolean
}) {
    const session = harness.engine.getOrCreateSession({
        tag: `member-${options.id}`,
        sessionId: options.sessionId,
        metadata: {
            path: options.workspaceRoot ?? '/tmp/project',
            host: 'localhost',
            flavor: options.flavor ?? 'codex',
            machineId: 'machine-1',
            ...(options.codexSessionId ? { codexSessionId: options.codexSessionId } : {})
        },
        agentState: null,
        model: options.model ?? 'gpt-5.4'
    })
    if (options.active) {
        harness.engine.handleSessionAlive({
            sid: session.id,
            time: Date.now()
        })
    }
    harness.store.teams.upsertMember({
        id: options.id,
        projectId: harness.managerSession.id,
        sessionId: session.id,
        managerSessionId: harness.managerSession.id,
        role: options.role,
        roleId: options.role,
        providerFlavor: options.flavor ?? 'codex',
        model: options.model ?? 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: options.isolationMode ?? 'simple',
        workspaceRoot: options.workspaceRoot ?? '/tmp/project',
        controlOwner: 'manager',
        membershipState: options.membershipState ?? 'active',
        revision: options.revision ?? 1,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: options.spawnedForTaskId ?? null,
        createdAt: 1_000,
        updatedAt: 1_000,
        archivedAt: options.membershipState === 'archived' ? 2_000 : null,
        removedAt: null
    })
    return session
}


function createTeamPreset() {
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

describe('team orchestration actions', () => {
    it('spawns a revision member through the authoritative orchestration owner and preserves bootstrap teamContext', async () => {
        const harness = createHarness()
        createMember(harness, {
            id: 'member-old',
            sessionId: 'member-old-session',
            role: 'implementer',
            flavor: 'codex',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project-worktrees/old',
            membershipState: 'archived',
            revision: 1,
            spawnedForTaskId: 'task-1',
            codexSessionId: 'codex-thread-1'
        })
        harness.store.teams.upsertTask({
            id: 'task-1',
            projectId: harness.managerSession.id,
            parentTaskId: null,
            title: 'Fix orchestration gaps',
            description: 'Land the missing manager tools',
            acceptanceCriteria: 'Manager can recruit and assign members',
            status: 'running',
            assigneeMemberId: 'member-old',
            reviewerMemberId: null,
            verifierMemberId: null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_100,
            updatedAt: 1_100,
            completedAt: null
        })

        const result = await harness.engine.spawnTeamMember({
            managerSessionId: harness.managerSession.id,
            roleId: 'implementer',
            providerFlavor: 'claude',
            taskId: 'task-1',
            taskGoal: 'Finish the remaining orchestration surface',
            failureSummary: 'Old provider lineage cannot be resumed in place.',
            instruction: '接着收口 Hub/CLI 主链。'
        })

        expect(result.launch).toMatchObject({
            strategy: 'revision',
            reason: 'provider_flavor_changed',
            previousMemberId: 'member-old'
        })
        expect(result.member).toMatchObject({
            role: 'implementer',
            roleId: 'implementer',
            providerFlavor: 'claude',
            revision: 2,
            supersedesMemberId: 'member-old',
            spawnedForTaskId: 'task-1'
        })
        expect(result.session.teamContext).toMatchObject({
            projectId: harness.managerSession.id,
            sessionRole: 'member',
            memberId: result.member.id,
            memberRole: 'implementer',
            memberRoleId: 'implementer',
            memberRoleName: 'implementer',
            memberRevision: 2,
            projectStatus: 'active'
        })
        expect(harness.store.teams.getMember('member-old')).toMatchObject({
            membershipState: 'superseded',
            supersededByMemberId: result.member.id
        })
        expect(harness.store.teams.getTask('task-1')).toMatchObject({
            assigneeMemberId: result.member.id
        })

        const messages = harness.store.messages.getMessages(result.member.sessionId, 5)
        expect(messages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                teamMessageKind: 'coordination'
            }
        })
        expect(messages[1]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                teamMessageKind: 'task-assign'
            }
        })
    })


    it('creates, updates, and deletes custom roles through one durable owner', async () => {
        const harness = createHarness()

        const createdRole = await harness.engine.createTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.'
        })
        const updatedRole = await harness.engine.updateTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-mobile',
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
        })
        const deletedRoleId = await harness.engine.deleteTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-mobile'
        })

        expect(createdRole).toMatchObject({
            id: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer'
        })
        expect(updatedRole).toMatchObject({
            id: 'reviewer-mobile',
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
        })
        expect(deletedRoleId).toBe('reviewer-mobile')
        expect(harness.engine.getTeamProjectSnapshot(harness.managerSession.id)?.roles.some((role) => role.id === 'reviewer-mobile')).toBe(false)
    })

    it('spawns a custom reviewer role via roleId while preserving reviewer prototype semantics', async () => {
        const harness = createHarness()
        await harness.engine.createTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.'
        })

        const result = await harness.engine.spawnTeamMember({
            managerSessionId: harness.managerSession.id,
            roleId: 'reviewer-mobile'
        })

        expect(result.member).toMatchObject({
            role: 'reviewer',
            roleId: 'reviewer-mobile'
        })
        expect(result.session.teamContext).toMatchObject({
            projectId: harness.managerSession.id,
            sessionRole: 'member',
            memberId: result.member.id,
            memberRole: 'reviewer',
            memberRoleId: 'reviewer-mobile',
            memberRoleName: 'Mobile Reviewer',
            memberRolePromptExtension: 'Focus on mobile regressions.',
            projectStatus: 'active'
        })
    })

    it('creates and updates tasks through one durable owner and injects the assignee transcript', async () => {
        const harness = createHarness()
        const implementerSession = createMember(harness, {
            id: 'member-implementer',
            sessionId: 'member-implementer-session',
            role: 'implementer',
            isolationMode: 'simple',
            workspaceRoot: '/tmp/project',
            active: true
        })

        const createdTask = await harness.engine.createTeamTask({
            managerSessionId: harness.managerSession.id,
            title: 'Audit the new orchestration chain',
            description: 'Check hub, cli, and docs alignment.',
            acceptanceCriteria: 'Focused tests pass and docs match code.',
            assigneeMemberId: 'member-implementer',
            note: '先跑 focused validation，再看结构问题。'
        })
        await harness.engine.updateTeamTask({
            managerSessionId: harness.managerSession.id,
            taskId: createdTask.id,
            status: 'blocked',
            note: '先补 route contract，再继续实现。'
        })

        expect(harness.store.teams.getTask(createdTask.id)).toMatchObject({
            status: 'blocked',
            assigneeMemberId: 'member-implementer'
        })
        const taskEvents = harness.store.teams.listTaskEvents(createdTask.id)
        expect(taskEvents.map((event) => event.kind)).toEqual([
            'task-created',
            'task-assigned',
            'task-status-changed'
        ])

        const messages = harness.store.messages.getMessages(implementerSession.id, 5)
        expect(messages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                teamMessageKind: 'task-assign'
            }
        })
        expect(messages[1]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                teamMessageKind: 'follow-up'
            }
        })
    })

    it('records project settings changes as durable project history events', async () => {
        const harness = createHarness()

        const snapshot = await harness.engine.updateTeamProjectSettings({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        })

        expect(snapshot.project).toMatchObject({
            id: harness.managerSession.id,
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        })

        const history = harness.engine.getTeamProjectHistory(harness.managerSession.id)
        expect(history?.events.map((event) => event.kind)).toEqual([
            'project-updated',
            'project-created'
        ])
        expect(history?.events[0]).toMatchObject({
            kind: 'project-updated',
            actorType: 'manager',
            actorId: harness.managerSession.id,
            targetType: 'project',
            targetId: harness.managerSession.id,
            payload: {
                updatedFields: ['maxActiveMembers', 'defaultIsolationMode'],
                previousMaxActiveMembers: 6,
                nextMaxActiveMembers: 4,
                previousDefaultIsolationMode: 'hybrid',
                nextDefaultIsolationMode: 'all_simple'
            }
        })
    })


    it('exports bootstrap presets from authoritative project settings and custom roles only', async () => {
        const harness = createHarness()
        await harness.engine.createTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.'
        })

        const preset = await harness.engine.exportTeamProjectPreset({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id
        })

        expect(preset).toEqual({
            schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
            projectSettings: {
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid'
            },
            roles: [{
                id: 'reviewer-mobile',
                prototype: 'reviewer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.',
                providerFlavor: 'codex',
                model: null,
                reasoningEffort: null,
                isolationMode: 'simple'
            }]
        })
    })

    it('imports bootstrap presets with replace semantics and durable project history', async () => {
        const harness = createHarness()
        await harness.engine.createTeamRole({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            roleId: 'reviewer-legacy',
            prototype: 'reviewer',
            name: 'Legacy Reviewer',
            promptExtension: 'Old role to be replaced.'
        })

        const snapshot = await harness.engine.importTeamProjectPreset({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            preset: createTeamPreset()
        })

        expect(snapshot.project).toMatchObject({
            id: harness.managerSession.id,
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        })
        expect(snapshot.roles.some((role) => role.id === 'reviewer-mobile')).toBe(true)
        expect(snapshot.roles.some((role) => role.id === 'reviewer-legacy')).toBe(false)

        const history = harness.engine.getTeamProjectHistory(harness.managerSession.id)
        expect(history?.events[0]).toMatchObject({
            kind: 'project-updated',
            actorType: 'manager',
            actorId: harness.managerSession.id,
            payload: {
                updatedFields: ['maxActiveMembers', 'defaultIsolationMode', 'roles'],
                previousMaxActiveMembers: 6,
                nextMaxActiveMembers: 4,
                previousDefaultIsolationMode: 'hybrid',
                nextDefaultIsolationMode: 'all_simple',
                presetImport: {
                    schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
                    importedRoleIds: ['reviewer-mobile'],
                    deletedRoleIds: ['reviewer-legacy']
                }
            }
        })
    })

    it('rejects preset imports once member orchestration has already started', async () => {
        const harness = createHarness()
        createMember(harness, {
            id: 'member-implementer',
            sessionId: 'member-implementer-session',
            role: 'implementer',
            isolationMode: 'worktree'
        })

        await expect(harness.engine.importTeamProjectPreset({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            preset: createTeamPreset()
        })).rejects.toMatchObject({
            code: 'team_preset_bootstrap_required'
        })
    })

    it('closes the project as delivered and archives active members once open tasks are resolved', async () => {
        const harness = createHarness()
        const memberSession = createMember(harness, {
            id: 'member-implementer',
            sessionId: 'member-implementer-session',
            role: 'implementer',
            isolationMode: 'simple',
            workspaceRoot: '/tmp/project'
        })
        harness.store.teams.upsertTask({
            id: 'task-1',
            projectId: harness.managerSession.id,
            parentTaskId: null,
            title: 'Finalize the project',
            description: null,
            acceptanceCriteria: null,
            status: 'done',
            assigneeMemberId: 'member-implementer',
            reviewerMemberId: null,
            verifierMemberId: null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_200,
            updatedAt: 1_300,
            completedAt: 1_300
        })
        harness.store.teams.insertEvent({
            id: 'event-review-passed',
            projectId: harness.managerSession.id,
            kind: 'review-passed',
            actorType: 'member',
            actorId: 'member-reviewer',
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: 'Review passed.'
            },
            createdAt: 1_250
        })
        harness.store.teams.insertEvent({
            id: 'event-verification-passed',
            projectId: harness.managerSession.id,
            kind: 'verification-passed',
            actorType: 'member',
            actorId: 'member-verifier',
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: 'Verification passed.'
            },
            createdAt: 1_275
        })
        harness.store.teams.insertEvent({
            id: 'event-manager-accepted',
            projectId: harness.managerSession.id,
            kind: 'manager-accepted',
            actorType: 'manager',
            actorId: harness.managerSession.id,
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: 'Ready to deliver.',
                skipVerificationReason: null
            },
            createdAt: 1_300
        })

        const result = await harness.engine.closeTeamProject({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
            summary: '所有编排路径已完成。'
        })

        expect(result.project).toMatchObject({
            status: 'delivered'
        })
        expect(harness.store.teams.getMember('member-implementer')).toMatchObject({
            membershipState: 'archived'
        })
        expect(harness.engine.getSession(memberSession.id)?.metadata?.lifecycleState).toBe('archived')
    })

    it('blocks project close when tasks are marked done without authoritative manager acceptance', async () => {
        const harness = createHarness()
        harness.store.teams.upsertTask({
            id: 'task-1',
            projectId: harness.managerSession.id,
            parentTaskId: null,
            title: 'Ship final output',
            description: null,
            acceptanceCriteria: null,
            status: 'done',
            assigneeMemberId: null,
            reviewerMemberId: null,
            verifierMemberId: null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_200,
            updatedAt: 1_300,
            completedAt: 1_300
        })
        harness.store.teams.insertEvent({
            id: 'event-review-passed',
            projectId: harness.managerSession.id,
            kind: 'review-passed',
            actorType: 'member',
            actorId: 'member-reviewer',
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: 'Review passed.'
            },
            createdAt: 1_250
        })
        harness.store.teams.insertEvent({
            id: 'event-verification-passed',
            projectId: harness.managerSession.id,
            kind: 'verification-passed',
            actorType: 'member',
            actorId: 'member-verifier',
            targetType: 'task',
            targetId: 'task-1',
            payload: {
                summary: 'Verification passed.'
            },
            createdAt: 1_275
        })

        await expect(harness.engine.closeTeamProject({
            managerSessionId: harness.managerSession.id,
            projectId: harness.managerSession.id,
        })).rejects.toMatchObject({
            code: 'team_project_close_blocked'
        })
    })

    it('blocks direct manager messages while a member is still completing a user interjection', async () => {
        const harness = createHarness()
        createMember(harness, {
            id: 'member-implementer',
            sessionId: 'member-implementer-session',
            role: 'implementer',
            active: true
        })

        await harness.engine.interjectTeamMember('member-implementer', {
            text: '先暂停一下，用户要补充一条 root cause。'
        })

        await expect(harness.engine.messageTeamMember({
            managerSessionId: harness.managerSession.id,
            memberId: 'member-implementer',
            text: '这条 manager 指令必须等 ready 之后再发'
        })).rejects.toMatchObject({
            code: 'team_member_control_conflict'
        })
    })
})
