import { describe, expect, it } from 'bun:test'
import { getSessionLifecycleState } from '@viby/protocol'
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
        tag: 'team-lifecycle-manager',
        sessionId: 'manager-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            name: 'Manager'
        },
        agentState: null,
        model: 'gpt-5.4',
        sessionRole: 'manager'
    })
    const memberSession = engine.getOrCreateSession({
        tag: 'team-lifecycle-member',
        sessionId: 'member-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        agentState: null,
        model: 'gpt-5.4'
    })

    store.teams.upsertMember({
        id: 'member-1',
        projectId: managerSession.id,
        sessionId: memberSession.id,
        managerSessionId: managerSession.id,
        role: 'implementer',
        roleId: 'implementer',
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
        createdAt: 1_100,
        updatedAt: 1_200,
        archivedAt: null,
        removedAt: null
    })

    return { store, engine, managerSession, memberSession }
}

describe('TeamLifecycleService', () => {
    it('archives and restores team members through the authoritative team lifecycle owner', async () => {
        const harness = createHarness()

        await harness.engine.archiveSession(harness.memberSession.id)

        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'archived',
            controlOwner: 'manager'
        })
        expect(getSessionLifecycleState(harness.engine.getSession(harness.memberSession.id)!)).toBe('archived')

        harness.engine.handleSessionAlive({
            sid: harness.memberSession.id,
            time: Date.now() + 1_000
        })

        expect(harness.engine.getSession(harness.memberSession.id)).toMatchObject({
            active: false
        })

        await harness.engine.unarchiveSession(harness.memberSession.id)

        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'active',
            archivedAt: null
        })
        expect(getSessionLifecycleState(harness.engine.getSession(harness.memberSession.id)!)).toBe('closed')

        const history = harness.engine.getTeamProjectHistory(harness.managerSession.id)
        expect(history?.events.map((event) => event.kind)).toEqual([
            'member-restored',
            'member-archived',
            'project-created'
        ])
    })

    it('maps manager session archive and restore onto project lifecycle without silently reviving archived members', async () => {
        const harness = createHarness()

        await harness.engine.archiveSession(harness.managerSession.id)

        expect(harness.store.teams.getProject(harness.managerSession.id)).toMatchObject({
            status: 'archived'
        })
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'archived'
        })
        expect(getSessionLifecycleState(harness.engine.getSession(harness.managerSession.id)!)).toBe('archived')
        expect(getSessionLifecycleState(harness.engine.getSession(harness.memberSession.id)!)).toBe('archived')

        await harness.engine.unarchiveSession(harness.managerSession.id)

        expect(harness.store.teams.getProject(harness.managerSession.id)).toMatchObject({
            status: 'active',
            archivedAt: null
        })
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'archived'
        })
        expect(getSessionLifecycleState(harness.engine.getSession(harness.managerSession.id)!)).toBe('closed')
        expect(getSessionLifecycleState(harness.engine.getSession(harness.memberSession.id)!)).toBe('archived')
    })

    it('rejects restoring removed members through generic session unarchive and forces revision semantics', async () => {
        const harness = createHarness()
        const existingMember = harness.store.teams.getMember('member-1')!
        harness.store.teams.upsertMember({
            ...existingMember,
            membershipState: 'removed',
            updatedAt: 1_500,
            archivedAt: 1_500,
            removedAt: 1_500
        })

        await harness.engine.archiveSession(harness.memberSession.id)

        await expect(harness.engine.unarchiveSession(harness.memberSession.id)).rejects.toMatchObject({
            code: 'team_member_restore_unavailable',
            status: 409
        })
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'removed'
        })
    })
})
