import { describe, expect, it } from 'bun:test'
import { Store } from './index'

function createStoredSession(
    store: Store,
    input: Parameters<Store['sessions']['getOrCreateSession']>[0]
) {
    return store.sessions.getOrCreateSession(input)
}

describe('TeamStore', () => {
    it('persists authoritative team records and derives session team context from them', () => {
        const store = new Store(':memory:')
        const managerSession = createStoredSession(store, {
            tag: 'manager-session',
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex', name: 'Manager Alpha' },
            agentState: null,
            model: 'gpt-5.4',
            sessionId: 'manager-session-id'
        })
        const activeMemberSession = createStoredSession(store, {
            tag: 'member-session-active',
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'codex' },
            agentState: null,
            model: 'gpt-5.4',
            sessionId: 'member-session-active-id'
        })
        const archivedMemberSession = createStoredSession(store, {
            tag: 'member-session-archived',
            metadata: { path: '/tmp/project', host: 'localhost', flavor: 'claude' },
            agentState: null,
            model: 'sonnet',
            sessionId: 'member-session-archived-id'
        })

        expect(store.sessions.setSessionAlive(activeMemberSession.id, 5_000)).toBe(true)

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
            updatedAt: 2_000,
            deliveredAt: null,
            archivedAt: null
        })
        store.teams.upsertMember({
            id: 'member-1',
            projectId: 'project-1',
            sessionId: activeMemberSession.id,
            managerSessionId: managerSession.id,
            role: 'implementer',
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
            spawnedForTaskId: 'task-1',
            createdAt: 1_100,
            updatedAt: 2_100,
            archivedAt: null,
            removedAt: null
        })
        store.teams.upsertMember({
            id: 'member-2',
            projectId: 'project-1',
            sessionId: archivedMemberSession.id,
            managerSessionId: managerSession.id,
            role: 'reviewer',
            providerFlavor: 'claude',
            model: 'sonnet',
            reasoningEffort: 'medium',
            isolationMode: 'simple',
            workspaceRoot: '/tmp/project/reviewer',
            controlOwner: 'user',
            membershipState: 'archived',
            revision: 2,
            supersedesMemberId: null,
            supersededByMemberId: null,
            spawnedForTaskId: 'task-2',
            createdAt: 1_200,
            updatedAt: 2_200,
            archivedAt: 3_000,
            removedAt: null
        })
        store.teams.upsertTask({
            id: 'task-1',
            projectId: 'project-1',
            parentTaskId: null,
            title: 'Implement team schema',
            description: 'Add authoritative tables',
            acceptanceCriteria: 'Store and summary pass tests',
            status: 'blocked',
            assigneeMemberId: 'member-1',
            reviewerMemberId: 'member-2',
            verifierMemberId: null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_300,
            updatedAt: 2_300,
            completedAt: null
        })
        store.teams.insertEvent({
            id: 'event-1',
            projectId: 'project-1',
            kind: 'project-created',
            actorType: 'manager',
            actorId: managerSession.id,
            targetType: 'project',
            targetId: 'project-1',
            payload: { goal: 'Ship manager teams' },
            createdAt: 1_400
        })

        expect(store.teams.getProjectByManagerSessionId(managerSession.id)).toMatchObject({
            id: 'project-1',
            title: 'Project Alpha'
        })
        expect(store.teams.listProjectMembers('project-1')).toHaveLength(2)
        expect(store.teams.listProjectTasks('project-1')).toHaveLength(1)
        expect(store.teams.listProjectEvents('project-1')).toHaveLength(1)

        expect(store.teams.getSessionTeamContext(managerSession.id)).toMatchObject({
            projectId: 'project-1',
            sessionRole: 'manager',
            managerSessionId: managerSession.id,
            managerTitle: 'Manager Alpha',
            projectStatus: 'active',
            activeMemberCount: 1,
            archivedMemberCount: 1,
            runningMemberCount: 1,
            blockedTaskCount: 1
        })
        expect(store.teams.getSessionTeamContext(activeMemberSession.id)).toMatchObject({
            projectId: 'project-1',
            sessionRole: 'member',
            managerSessionId: managerSession.id,
            managerTitle: 'Manager Alpha',
            memberId: 'member-1',
            memberRole: 'implementer',
            memberRevision: 1,
            controlOwner: 'manager',
            membershipState: 'active',
            projectStatus: 'active',
            activeMemberCount: 1,
            archivedMemberCount: 1,
            runningMemberCount: 1,
            blockedTaskCount: 1
        })
    })
})
