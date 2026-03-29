// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'
import { TEAM_PRESET_SCHEMA_VERSION } from '@viby/protocol'
import type {
    Session,
    TeamProjectPreset,
    TeamProjectSnapshot,
    TeamRoleDefinition
} from '@/types/api'

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    })
}

function createSession(id: string = 'session-1'): Session {
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
            flavor: 'codex',
            machineId: 'machine-1',
            lifecycleState: 'running',
            lifecycleStateSince: 1_000
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 1_000,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'default',
        todos: undefined
    }
}

function createTeamRole(roleId: string = 'reviewer-mobile'): TeamRoleDefinition {
    return {
        projectId: 'project-1',
        id: roleId,
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
    }
}

function createTeamProjectPreset(): TeamProjectPreset {
    return {
        schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
        projectSettings: {
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        },
        roles: [{
            id: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple'
        }]
    }
}

function createTeamProjectSnapshot(): TeamProjectSnapshot {
    return {
        project: {
            id: 'project-1',
            managerSessionId: 'manager-session-1',
            machineId: 'machine-1',
            rootDirectory: '/tmp/project',
            title: 'Manager Project',
            goal: 'Ship manager teams',
            status: 'active',
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple' as const,
            createdAt: 1_000,
            updatedAt: 2_500,
            deliveredAt: null,
            archivedAt: null
        },
        roles: [createTeamRole()],
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
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple',
                updatedAt: 2_500,
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
                remainingMemberSlots: 4,
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

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('ApiClient session snapshot normalization', () => {
    it('forwards manager sessionRole through the spawn request body', async () => {
        const session = createSession('manager-session-1')
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/machines/machine-1/spawn')) {
                expect(init?.method).toBe('POST')
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    directory: '/tmp/project',
                    agent: 'claude',
                    sessionRole: 'manager'
                })
                return jsonResponse({ type: 'success', session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const response = await api.spawnSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'claude',
            sessionRole: 'manager'
        })

        expect(response).toEqual({ type: 'success', session })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('normalizes legacy spawn success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/api/machines/machine-1/spawn')) {
                return jsonResponse({ type: 'success', sessionId: session.id })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const response = await api.spawnSession({
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'codex'
        })

        expect(response).toEqual({ type: 'success', session })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('normalizes legacy resume success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/resume`)) {
                return jsonResponse({ type: 'success', sessionId: session.id })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const resumedSession = await api.resumeSession(session.id)

        expect(resumedSession).toEqual(session)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('normalizes legacy live-config success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const updatedSession = {
            ...session,
            permissionMode: 'read-only' as const
        }
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/permission-mode`)) {
                return jsonResponse({ ok: true })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session: updatedSession })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.setPermissionMode(session.id, 'read-only')

        expect(result).toEqual(updatedSession)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('loads team project snapshots through the dedicated teams API owner', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/api/team-projects/project-1')) {
                return jsonResponse({
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
                    events: [],
                    acceptance: {
                        tasks: {},
                        recentResults: []
                    }
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.getTeamProject('project-1')

        expect(result.project.id).toBe('project-1')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('loads team history through the dedicated lazy history API owner', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/api/team-projects/project-1/history')) {
                return jsonResponse({
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
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.getTeamProjectHistory('project-1')

        expect(result.projectId).toBe('project-1')
        expect(result.events[0]?.kind).toBe('member-archived')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('patches project settings through the dedicated teams API owner', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/team-projects/project-1/settings')) {
                expect(init?.method).toBe('PATCH')
                expect(JSON.parse(String(init?.body))).toEqual({
                    managerSessionId: 'manager-session-1',
                    maxActiveMembers: 4,
                    defaultIsolationMode: 'all_simple'
                })
                return jsonResponse({
                    project: {
                        id: 'project-1',
                        managerSessionId: 'manager-session-1',
                        machineId: 'machine-1',
                        rootDirectory: '/tmp/project',
                        title: 'Manager Project',
                        goal: 'Ship manager teams',
                        status: 'active',
                        maxActiveMembers: 4,
                        defaultIsolationMode: 'all_simple',
                        createdAt: 1_000,
                        updatedAt: 2_500,
                        deliveredAt: null,
                        archivedAt: null
                    },
                    members: [],
                    tasks: [],
                    events: [],
                    acceptance: {
                        tasks: {},
                        recentResults: []
                    }
                })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.updateTeamProjectSettings('project-1', {
            managerSessionId: 'manager-session-1',
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple'
        })

        expect(result.project.maxActiveMembers).toBe(4)
        expect(result.project.defaultIsolationMode).toBe('all_simple')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('posts member control actions through the dedicated teams API owner', async () => {
        const session = createSession('member-session-1')
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/team-members/member-1/interject')) {
                expect(init?.method).toBe('POST')
                expect(JSON.parse(String(init?.body))).toEqual({
                    text: 'please continue',
                    localId: 'local-1'
                })
                return jsonResponse({ ok: true, session })
            }
            if (url.includes('/api/team-members/member-1/takeover')) {
                return jsonResponse({ ok: true, session })
            }
            if (url.includes('/api/team-members/member-1/return')) {
                return jsonResponse({ ok: true, session })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        await expect(api.interjectTeamMember('member-1', {
            text: 'please continue',
            localId: 'local-1'
        })).resolves.toEqual(session)
        await expect(api.takeOverTeamMember('member-1')).resolves.toEqual(session)
        await expect(api.returnTeamMember('member-1')).resolves.toEqual(session)
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('normalizes legacy lifecycle success responses by fetching the authoritative session snapshot', async () => {
        const session = createSession()
        const archivedSession = {
            ...session,
            active: false,
            updatedAt: 2_000,
            metadata: {
                ...session.metadata!,
                lifecycleState: 'archived' as const,
                lifecycleStateSince: 2_000
            }
        }
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes(`/api/sessions/${session.id}/archive`)) {
                return jsonResponse({ ok: true })
            }
            if (url.includes(`/api/sessions/${session.id}`)) {
                return jsonResponse({ session: archivedSession })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        const result = await api.archiveSession(session.id)

        expect(result).toEqual(archivedSession)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })
    it('loads and applies team presets through the dedicated teams API owner', async () => {
        const preset = createTeamProjectPreset()
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/team-projects/project-1/preset') && init?.method === undefined) {
                return jsonResponse(preset)
            }
            if (url.includes('/api/team-projects/project-1/preset') && init?.method === 'PUT') {
                expect(JSON.parse(String(init.body))).toEqual({
                    managerSessionId: 'manager-session-1',
                    preset
                })
                return jsonResponse(createTeamProjectSnapshot())
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        await expect(api.getTeamProjectPreset('project-1')).resolves.toEqual(preset)
        await expect(api.applyTeamProjectPreset('project-1', {
            managerSessionId: 'manager-session-1',
            preset
        })).resolves.toMatchObject({
            project: {
                id: 'project-1',
                maxActiveMembers: 4,
                defaultIsolationMode: 'all_simple'
            },
            roles: [expect.objectContaining({ id: 'reviewer-mobile' })]
        })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('creates, updates, and deletes custom roles through the dedicated teams API owner', async () => {
        const createdRole = createTeamRole()
        const updatedRole = {
            ...createdRole,
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
            updatedAt: 2_100
        }
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input)
            if (url.includes('/api/team-projects/project-1/roles') && init?.method === 'POST') {
                expect(JSON.parse(String(init.body))).toEqual({
                    managerSessionId: 'manager-session-1',
                    roleId: 'reviewer-mobile',
                    prototype: 'reviewer',
                    name: 'Mobile Reviewer',
                    promptExtension: 'Focus on mobile regressions.',
                    providerFlavor: 'codex',
                    model: 'gpt-5.4',
                    reasoningEffort: 'high',
                    isolationMode: 'simple'
                })
                return jsonResponse({ ok: true, role: createdRole })
            }
            if (url.includes('/api/team-projects/project-1/roles/reviewer-mobile') && init?.method === 'PATCH') {
                expect(JSON.parse(String(init.body))).toEqual({
                    managerSessionId: 'manager-session-1',
                    name: 'Mobile Review Lead',
                    promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
                    providerFlavor: 'codex',
                    model: 'gpt-5.4',
                    reasoningEffort: 'high',
                    isolationMode: 'simple'
                })
                return jsonResponse({ ok: true, role: updatedRole })
            }
            if (url.includes('/api/team-projects/project-1/roles/reviewer-mobile') && init?.method === 'DELETE') {
                expect(JSON.parse(String(init.body))).toEqual({
                    managerSessionId: 'manager-session-1'
                })
                return jsonResponse({ ok: true, roleId: 'reviewer-mobile' })
            }
            throw new Error(`Unexpected fetch: ${url}`)
        })
        vi.stubGlobal('fetch', fetchMock)

        const api = new ApiClient('token')
        await expect(api.createTeamRole('project-1', {
            managerSessionId: 'manager-session-1',
            roleId: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple'
        })).resolves.toEqual(createdRole)
        await expect(api.updateTeamRole('project-1', 'reviewer-mobile', {
            managerSessionId: 'manager-session-1',
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple'
        })).resolves.toEqual(updatedRole)
        await expect(api.deleteTeamRole('project-1', 'reviewer-mobile', {
            managerSessionId: 'manager-session-1'
        })).resolves.toBe('reviewer-mobile')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

})
