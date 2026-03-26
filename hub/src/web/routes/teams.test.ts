import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session, TeamProjectSnapshot } from '@viby/protocol/types'
import {
    TeamMemberControlError,
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
        teamState: undefined,
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
        members: [],
        tasks: [],
        events: []
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
})
