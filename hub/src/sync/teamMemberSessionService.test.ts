import { describe, expect, it } from 'bun:test'
import { createBuiltInTeamRoleDefinition } from '@viby/protocol'
import type { TeamProject, TeamTaskRecord } from '@viby/protocol/types'
import { Store } from '../store'
import {
    buildRevisionCarryoverBrief,
    TeamMemberSessionService,
    type RevisionCarryoverMessageInput
} from './teamMemberSessionService'

function createHarness(projectOverrides?: Partial<TeamProject>) {
    const store = new Store(':memory:')
    const managerSession = store.sessions.getOrCreateSession({
        tag: 'manager-session',
        metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex', name: 'Manager Alpha' },
        agentState: null,
        model: 'gpt-5.4',
        sessionId: 'manager-session-id'
    })

    const project = store.teams.upsertProject({
        id: 'project-1',
        managerSessionId: managerSession.id,
        machineId: 'machine-1',
        rootDirectory: '/tmp/project',
        title: 'Project Alpha',
        goal: 'Ship manager teams',
        status: 'active',
        maxActiveMembers: 6,
        defaultIsolationMode: 'hybrid',
        createdAt: 1_000,
        updatedAt: 1_000,
        deliveredAt: null,
        archivedAt: null,
        ...projectOverrides
    })
    for (const prototype of ['implementer', 'reviewer', 'verifier'] as const) {
        store.teams.upsertRole(createBuiltInTeamRoleDefinition(project.id, prototype, project.createdAt))
    }

    const service = new TeamMemberSessionService(store)
    return { store, managerSession, service }
}

function createMember(options: {
    store: Store
    id: string
    sessionId: string
    role?: 'implementer' | 'reviewer'
    flavor?: 'codex' | 'claude'
    model?: string
    isolationMode?: 'simple' | 'worktree'
    workspaceRoot?: string | null
    membershipState?: 'active' | 'archived' | 'superseded'
    revision?: number
    codexSessionId?: string
    sessionActive?: boolean
    summary?: string
}): void {
    const session = options.store.sessions.getOrCreateSession({
        tag: `tag-${options.sessionId}`,
        metadata: {
            path: options.workspaceRoot ?? '/tmp/project',
            host: 'localhost',
            flavor: options.flavor ?? 'codex',
            ...(options.codexSessionId ? { codexSessionId: options.codexSessionId } : {}),
            ...(options.summary ? { summary: { text: options.summary, updatedAt: 2_000 } } : {})
        },
        agentState: null,
        model: options.model ?? 'gpt-5.4',
        sessionId: options.sessionId
    })
    if (options.sessionActive) {
        options.store.sessions.setSessionAlive(session.id, 2_100)
    }

    options.store.teams.upsertMember({
        id: options.id,
        projectId: 'project-1',
        sessionId: options.sessionId,
        managerSessionId: 'manager-session-id',
        role: options.role ?? 'implementer',
        roleId: options.role ?? 'implementer',
        providerFlavor: options.flavor ?? 'codex',
        model: options.model ?? 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: options.isolationMode ?? 'worktree',
        workspaceRoot: options.workspaceRoot ?? '/tmp/project/worktrees/member-1',
        controlOwner: 'manager',
        membershipState: options.membershipState ?? 'active',
        revision: options.revision ?? 1,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: 'task-1',
        createdAt: 1_500,
        updatedAt: 2_000 + (options.revision ?? 1),
        archivedAt: options.membershipState === 'archived' ? 2_500 : null,
        removedAt: null
    })
}

function createTask(store: Store, overrides?: Partial<TeamTaskRecord>): void {
    store.teams.upsertTask({
        id: 'task-1',
        projectId: 'project-1',
        parentTaskId: null,
        title: 'Recover blocked task',
        description: null,
        acceptanceCriteria: 'Task is unblocked',
        status: 'blocked',
        assigneeMemberId: 'member-active',
        reviewerMemberId: null,
        verifierMemberId: null,
        priority: 'high',
        dependsOn: [],
        retryCount: 0,
        createdAt: 1_900,
        updatedAt: 2_000,
        completedAt: null,
        ...overrides
    })
}

function buildStaffing(harness: ReturnType<typeof createHarness>) {
    const project = harness.store.teams.getProject('project-1')
    if (!project) {
        throw new Error('Expected project-1')
    }

    return harness.service.buildProjectStaffing({
        project,
        roles: harness.store.teams.listProjectRoles(project.id),
        members: harness.store.teams.listProjectMembers(project.id),
        tasks: harness.store.teams.listProjectTasks(project.id)
    })
}

describe('TeamMemberSessionService', () => {
    it('prefers resume when the latest inactive member is compatible and still has a resume token', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-1',
            sessionId: 'member-session-1',
            codexSessionId: 'codex-thread-1'
        })

        const plan = harness.service.planInactiveLaunch({
            projectId: 'project-1',
            roleId: 'implementer',
            providerFlavor: 'codex',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project/worktrees/member-1',
            contextTrusted: true,
            workspaceTrusted: true
        })

        expect(plan).toMatchObject({
            strategy: 'resume',
            reason: 'resume_supported',
            candidate: {
                member: {
                    id: 'member-1'
                }
            }
        })
    })

    it('forces revision when provider flavor changes even if an older lineage exists', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-1',
            sessionId: 'member-session-1',
            flavor: 'codex',
            codexSessionId: 'codex-thread-1',
            revision: 1
        })

        const plan = harness.service.planInactiveLaunch({
            projectId: 'project-1',
            roleId: 'implementer',
            providerFlavor: 'claude',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project/worktrees/member-1',
            contextTrusted: true,
            workspaceTrusted: true
        })

        expect(plan).toMatchObject({
            strategy: 'revision',
            reason: 'provider_flavor_changed',
            candidate: {
                member: {
                    id: 'member-1'
                }
            }
        })
    })

    it('forces revision when the reusable member lost its resume token', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-1',
            sessionId: 'member-session-1'
        })

        const plan = harness.service.planInactiveLaunch({
            projectId: 'project-1',
            roleId: 'implementer',
            providerFlavor: 'codex',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project/worktrees/member-1',
            contextTrusted: true,
            workspaceTrusted: true
        })

        expect(plan).toMatchObject({
            strategy: 'revision',
            reason: 'resume_token_missing'
        })
    })

    it('builds a compact carryover brief and manager-owned message metadata for revision members', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-1',
            sessionId: 'member-session-1',
            codexSessionId: 'codex-thread-1',
            summary: 'Implemented schema migration but store tests still fail on team context hydration.'
        })

        const plan = harness.service.planInactiveLaunch({
            projectId: 'project-1',
            roleId: 'implementer',
            providerFlavor: 'claude',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project/worktrees/member-1',
            contextTrusted: true,
            workspaceTrusted: true
        })
        if (plan.strategy !== 'revision') {
            throw new Error('Expected revision plan')
        }

        const brief = buildRevisionCarryoverBrief({
            plan,
            taskGoal: 'Finish the manager teams migration work.',
            artifactSummary: 'Hub tables and typed session summaries already landed.',
            attemptSummary: 'Manager bootstrap is done; member replacement is still missing.',
            failureSummary: 'Resume would leak the old provider contract.',
            reviewSummary: 'Review requires a clean Claude pass.',
            filePointers: [
                'hub/src/sync/teamCoordinatorService.ts',
                'shared/src/teamSchemas.ts'
            ]
        })
        expect(brief).toContain('Compact carryover brief')
        expect(brief).toContain('Previous member: implementer rev 1 (codex, gpt-5.4)')
        expect(brief).toContain('Review requires a clean Claude pass.')

        const messageInput: RevisionCarryoverMessageInput = {
            projectId: 'project-1',
            managerSessionId: harness.managerSession.id,
            memberId: 'member-2',
            plan,
            taskGoal: 'Finish the manager teams migration work.',
            artifactSummary: 'Hub tables and typed session summaries already landed.',
            failureSummary: 'Resume would leak the old provider contract.'
        }
        const message = harness.service.buildRevisionCarryoverMessage(messageInput)

        expect(message.text).toContain('Reason for revision')
        expect(message.meta).toEqual({
            sentFrom: 'manager',
            teamProjectId: 'project-1',
            managerSessionId: harness.managerSession.id,
            memberId: 'member-2',
            sessionRole: 'member',
            teamMessageKind: 'coordination',
            controlOwner: 'manager'
        })
    })

    it('builds a reuse-existing-lineage staffing hint when a blocked task has a resumable inactive candidate', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-active',
            sessionId: 'member-session-active',
            sessionActive: true
        })
        createMember({
            store: harness.store,
            id: 'member-archived',
            sessionId: 'member-session-archived',
            membershipState: 'archived',
            revision: 2,
            codexSessionId: 'codex-thread-archived'
        })
        createTask(harness.store)

        const staffing = buildStaffing(harness)

        expect(staffing).toMatchObject({
            seatPressure: 'available',
            remainingMemberSlots: 5
        })
        expect(staffing.hints).toEqual([
            expect.objectContaining({
                kind: 'reuse-existing-lineage',
                taskId: 'task-1',
                roleId: 'implementer',
                memberId: 'member-active',
                candidateMemberId: 'member-archived',
                launchStrategy: 'resume'
            })
        ])
    })

    it('builds a replace-current-member staffing hint when blocked work needs a fresh revision', () => {
        const harness = createHarness()
        createMember({
            store: harness.store,
            id: 'member-active',
            sessionId: 'member-session-active',
            sessionActive: true
        })
        createMember({
            store: harness.store,
            id: 'member-archived',
            sessionId: 'member-session-archived',
            membershipState: 'archived',
            revision: 2
        })
        createTask(harness.store)

        const staffing = buildStaffing(harness)

        expect(staffing.hints).toEqual([
            expect.objectContaining({
                kind: 'replace-current-member',
                taskId: 'task-1',
                roleId: 'implementer',
                memberId: 'member-active',
                candidateMemberId: 'member-archived',
                launchStrategy: 'revision'
            })
        ])
    })

    it('builds a free-capacity staffing hint when the seat cap is full and no reusable lineage exists', () => {
        const harness = createHarness({
            maxActiveMembers: 1
        })
        createMember({
            store: harness.store,
            id: 'member-active',
            sessionId: 'member-session-active',
            sessionActive: true
        })
        createTask(harness.store)

        const staffing = buildStaffing(harness)

        expect(staffing).toMatchObject({
            seatPressure: 'at_capacity',
            remainingMemberSlots: 0
        })
        expect(staffing.hints).toEqual([
            expect.objectContaining({
                kind: 'free-capacity',
                taskId: 'task-1',
                roleId: 'implementer',
                memberId: 'member-active',
                candidateMemberId: null,
                launchStrategy: 'spawn'
            })
        ])
    })
})
