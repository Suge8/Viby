import { describe, expect, it } from 'bun:test'
import { Store } from '../store'
import {
    buildRevisionCarryoverBrief,
    TeamMemberSessionService,
    type RevisionCarryoverMessageInput
} from './teamMemberSessionService'

function createHarness() {
    const store = new Store(':memory:')
    const managerSession = store.sessions.getOrCreateSession({
        tag: 'manager-session',
        metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex', name: 'Manager Alpha' },
        agentState: null,
        model: 'gpt-5.4',
        sessionId: 'manager-session-id'
    })

    store.teams.upsertProject({
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
        archivedAt: null
    })

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
    summary?: string
}): void {
    options.store.sessions.getOrCreateSession({
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

    options.store.teams.upsertMember({
        id: options.id,
        projectId: 'project-1',
        sessionId: options.sessionId,
        managerSessionId: 'manager-session-id',
        role: options.role ?? 'implementer',
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
            role: 'implementer',
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
            role: 'implementer',
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
            role: 'implementer',
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
            role: 'implementer',
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
})
