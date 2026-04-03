import { describe, expect, it } from 'bun:test'
import type { SessionMessageActivity } from '@viby/protocol/types'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createPermissionsRoutes } from './permissions'
import { createSessionsRoutes } from './sessions'

const DEFAULT_PERMISSION_REQUEST_ID = 'request-1'

function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        driver: 'codex' as const
    }
    const base: Session = {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: baseMetadata,
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {}
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        modelReasoningEffort: null,
        permissionMode: 'default',
        collaborationMode: 'default'
    }

    return {
        ...base,
        ...overrides,
        metadata: overrides?.metadata === undefined
            ? base.metadata
            : overrides.metadata === null
                ? null
                : {
                    ...baseMetadata,
                    ...overrides.metadata
                },
        agentState: overrides?.agentState === undefined ? base.agentState : overrides.agentState
    }
}

function createApp(
    session: Session,
    options?: {
        abortSessionResult?: Session
        deleteSessionError?: Error & { status?: number }
        resumeResult?: Awaited<ReturnType<SyncEngine['resumeSession']>>
        switchDriverResult?: Awaited<ReturnType<SyncEngine['switchSessionDriver']>>
        dropSessionSnapshotAfterConfig?: boolean
        slashCommandsResult?: Awaited<ReturnType<SyncEngine['listSlashCommands']>>
    }
) {
    const abortSessionCalls: string[] = []
    const applySessionConfigCalls: Array<[string, Record<string, unknown>]> = []
    const approvePermissionCalls: Array<[
        string,
        string,
        unknown,
        string[] | undefined,
        string | undefined,
        Record<string, string[]> | Record<string, { answers: string[] }> | undefined
    ]> = []
    const archiveSessionCalls: string[] = []
    const closeSessionCalls: string[] = []
    const deleteSessionCalls: string[] = []
    const denyPermissionCalls: Array<[string, string, string | undefined]> = []
    const listSlashCommandsCalls: Array<[string, string]> = []
    const recoveryCalls: Array<[string, { afterSeq: number; limit: number }]> = []
    const resumeSessionCalls: string[] = []
    const switchDriverCalls: Array<[string, 'claude' | 'codex']> = []
    let currentSession = session
    let sessionSnapshotAvailable = true
    const renameSessionCalls: Array<[string, string]> = []
    const unarchiveSessionCalls: string[] = []
    const applySessionConfig = async (sessionId: string, config: Record<string, unknown>) => {
        applySessionConfigCalls.push([sessionId, config])
        currentSession = {
            ...currentSession,
            model: 'model' in config ? (config.model as Session['model']) ?? null : currentSession.model,
            modelReasoningEffort: 'modelReasoningEffort' in config
                ? (config.modelReasoningEffort as Session['modelReasoningEffort']) ?? null
                : currentSession.modelReasoningEffort,
            permissionMode: 'permissionMode' in config
                ? config.permissionMode as Session['permissionMode']
                : currentSession.permissionMode,
            collaborationMode: 'collaborationMode' in config
                ? config.collaborationMode as Session['collaborationMode']
                : currentSession.collaborationMode,
            updatedAt: currentSession.updatedAt + 1
        }
        if (options?.dropSessionSnapshotAfterConfig) {
            sessionSnapshotAvailable = false
        }
    }
    const engine = {
        getSession: () => sessionSnapshotAvailable ? currentSession : undefined,
        abortSession: async (sessionId: string) => {
            abortSessionCalls.push(sessionId)
            currentSession = options?.abortSessionResult ?? {
                ...currentSession,
                thinking: false,
                thinkingAt: currentSession.updatedAt + 1
            }
            return currentSession
        },
        applySessionConfig,
        approvePermission: async (
            sessionId: string,
            requestId: string,
            mode?: unknown,
            allowTools?: string[],
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        ) => {
            approvePermissionCalls.push([sessionId, requestId, mode, allowTools, decision, answers])
        },
        archiveSession: async (sessionId: string) => {
            archiveSessionCalls.push(sessionId)
            currentSession = {
                ...currentSession,
                active: false,
                metadata: currentSession.metadata
                    ? {
                        ...currentSession.metadata,
                        lifecycleState: 'archived',
                        lifecycleStateSince: currentSession.updatedAt + 1
                    }
                    : null
            }
            return currentSession
        },
        closeSession: async (sessionId: string) => {
            closeSessionCalls.push(sessionId)
            currentSession = {
                ...currentSession,
                active: false,
                metadata: currentSession.metadata
                    ? {
                        ...currentSession.metadata,
                        lifecycleState: 'closed',
                        lifecycleStateSince: currentSession.updatedAt + 1
                    }
                    : null
            }
            return currentSession
        },
        deleteSession: async (sessionId: string) => {
            deleteSessionCalls.push(sessionId)
            if (options?.deleteSessionError) {
                throw options.deleteSessionError
            }
        },
        denyPermission: async (
            sessionId: string,
            requestId: string,
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        ) => {
            denyPermissionCalls.push([sessionId, requestId, decision])
        },
        getSessionRecoveryPage: (sessionId: string, options: { afterSeq: number; limit: number }) => {
            recoveryCalls.push([sessionId, options])
            return {
                session: currentSession,
                messages: [],
                page: {
                    afterSeq: options.afterSeq,
                    nextAfterSeq: options.afterSeq,
                    limit: options.limit,
                    hasMore: false
                }
            }
        },
        listSlashCommands: async (sessionId: string, agent: string) => {
            listSlashCommandsCalls.push([sessionId, agent])
            return options?.slashCommandsResult ?? {
                success: true,
                commands: []
            }
        },
        renameSession: async (sessionId: string, name: string) => {
            renameSessionCalls.push([sessionId, name])
            currentSession = {
                ...currentSession,
                metadata: currentSession.metadata
                    ? { ...currentSession.metadata, name }
                    : null,
                metadataVersion: currentSession.metadataVersion + 1
            }
            return currentSession
        },
        resumeSession: async (sessionId: string) => {
            resumeSessionCalls.push(sessionId)
            const result = options?.resumeResult ?? {
                type: 'success',
                sessionId
            }
            if (result.type === 'success') {
                currentSession = {
                    ...currentSession,
                    active: true,
                    activeAt: currentSession.updatedAt + 1,
                    updatedAt: currentSession.updatedAt + 1,
                    metadata: currentSession.metadata
                        ? {
                            ...currentSession.metadata,
                            lifecycleState: 'running',
                            lifecycleStateSince: currentSession.updatedAt + 1
                        }
                        : null
                }
            }
            return result
        },
        switchSessionDriver: async (sessionId: string, targetDriver: 'claude' | 'codex') => {
            switchDriverCalls.push([sessionId, targetDriver])
            const result = options?.switchDriverResult ?? {
                type: 'success' as const,
                targetDriver,
                session: {
                    ...currentSession,
                    metadata: currentSession.metadata
                        ? {
                            ...currentSession.metadata,
                            driver: targetDriver
                        }
                        : null,
                    updatedAt: currentSession.updatedAt + 1
                }
            }
            if (result.type === 'success') {
                currentSession = result.session
            }
            return result
        },
        unarchiveSession: async (sessionId: string) => {
            unarchiveSessionCalls.push(sessionId)
            currentSession = {
                ...currentSession,
                active: false,
                metadata: currentSession.metadata
                    ? {
                        ...currentSession.metadata,
                        lifecycleState: 'closed',
                        lifecycleStateSince: currentSession.updatedAt + 1
                    }
                    : null
            }
            return currentSession
        }
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.route('/api', createSessionsRoutes(() => engine as SyncEngine))
    app.route('/api', createPermissionsRoutes(() => engine as SyncEngine))

    return {
        app,
        abortSessionCalls,
        applySessionConfigCalls,
        approvePermissionCalls,
        archiveSessionCalls,
        closeSessionCalls,
        deleteSessionCalls,
        denyPermissionCalls,
        listSlashCommandsCalls,
        recoveryCalls,
        resumeSessionCalls,
        switchDriverCalls,
        renameSessionCalls,
        unarchiveSessionCalls
    }
}

function createSessionsListApp(options: {
    sessions: Session[]
    messageActivities?: Record<string, SessionMessageActivity>
}) {
    const engine = {
        getSessions: () => options.sessions,
        getSessionMessageActivities: (sessionIds: string[]) => {
            return Object.fromEntries(
                sessionIds.map((sessionId) => [
                    sessionId,
                    options.messageActivities?.[sessionId] ?? {
                        latestActivityAt: null,
                        latestActivityKind: null,
                        latestCompletedReplyAt: null
                    }
                ])
            )
        }
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.route('/api', createSessionsRoutes(() => engine as SyncEngine))
    return app
}

describe('sessions routes', () => {
    it('returns the authoritative session snapshot when abort succeeds', async () => {
        const session = createSession({
            active: true,
            thinking: true,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: 1
            }
        })
        const abortedSession = {
            ...session,
            thinking: false,
            thinkingAt: 2
        }
        const { app, abortSessionCalls } = createApp(session, {
            abortSessionResult: abortedSession
        })

        const response = await app.request('/api/sessions/session-1/abort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({})
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            session: abortedSession
        })
        expect(abortSessionCalls).toEqual(['session-1'])
    })

    it('returns the authoritative session snapshot when driver switching succeeds', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex'
            }
        })
        const { app, switchDriverCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'claude' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            targetDriver: 'claude',
            session: {
                id: 'session-1',
                metadata: {
                    driver: 'claude'
                }
            }
        })
        expect(switchDriverCalls).toEqual([['session-1', 'claude']])
    })

    it('returns typed stageful failures when driver switching is rejected by the Hub contract', async () => {
        const session = createSession({
            active: true,
            thinking: true,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex'
            }
        })
        const { app, switchDriverCalls } = createApp(session, {
            switchDriverResult: {
                type: 'error',
                message: 'Driver switching requires an idle active session',
                code: 'session_not_idle',
                stage: 'idle_gate',
                status: 409,
                targetDriver: 'claude',
                rollbackResult: 'not_started',
                session
            }
        })

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'claude' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Driver switching requires an idle active session',
            code: 'session_not_idle',
            stage: 'idle_gate',
            targetDriver: 'claude',
            rollbackResult: 'not_started',
            session
        })
        expect(switchDriverCalls).toEqual([['session-1', 'claude']])
    })

    it('rejects invalid driver-switch bodies before reaching the Hub contract', async () => {
        const { app, switchDriverCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'gemini' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid body' })
        expect(switchDriverCalls).toEqual([])
    })

    it('validates permission mode changes against the authoritative driver', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid permission mode for session driver'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('validates permission approvals against the authoritative driver', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor'
            },
            agentState: {
                controlledByUser: false,
                requests: {
                    [DEFAULT_PERMISSION_REQUEST_ID]: {
                        tool: 'shell',
                        arguments: {},
                        createdAt: 1
                    }
                },
                completedRequests: {}
            }
        })
        const { app, approvePermissionCalls } = createApp(session)

        const response = await app.request(`/api/sessions/session-1/permissions/${DEFAULT_PERMISSION_REQUEST_ID}/approve`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid permission mode for session driver'
        })
        expect(approvePermissionCalls).toEqual([])
    })

    it('lists slash commands using the authoritative driver', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor'
            }
        })
        const slashCommandsResult = {
            success: true,
            commands: [{ name: '/cursor-only', source: 'project' as const }]
        }
        const { app, listSlashCommandsCalls } = createApp(session, {
            slashCommandsResult
        })

        const response = await app.request('/api/sessions/session-1/slash-commands')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(slashCommandsResult)
        expect(listSlashCommandsCalls).toEqual([['session-1', 'cursor']])
    })

    it('rejects collaboration mode changes when the resolved driver is not codex', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode is only supported for Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode can only be changed for Viby-managed Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for non-Codex sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode is only supported for Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies collaboration mode changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                collaborationMode: 'plan'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { collaborationMode: 'plan' }]
        ])
    })

    it('returns the updated session snapshot after permission mode changes', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                permissionMode: 'read-only'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { permissionMode: 'read-only' }]
        ])
    })

    it('fails when the updated live config snapshot is unavailable', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession(), {
            dropSessionSnapshotAfterConfig: true
        })

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' })
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session snapshot unavailable after config update',
            code: 'session_not_found'
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { permissionMode: 'read-only' }]
        ])
    })

    it('allows archiving inactive sessions', async () => {
        const { app, archiveSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/archive', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'archived'
                }
            }
        })
        expect(archiveSessionCalls).toEqual(['session-1'])
    })

    it('routes close requests through closeSession', async () => {
        const { app, closeSessionCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/close', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'closed'
                }
            }
        })
        expect(closeSessionCalls).toEqual(['session-1'])
    })

    it('returns the resumed session snapshot when the synchronous resume contract succeeds', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'success',
                sessionId: 'session-1'
            }
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            type: 'success',
            session: createSession({
                active: true,
                activeAt: 2,
                updatedAt: 2,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    lifecycleState: 'running',
                    lifecycleStateSince: 2
                }
            })
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('returns 409 when resuming an archived session is rejected', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'error',
                message: 'Archived sessions must be restored before resuming',
                code: 'session_archived'
            }
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Archived sessions must be restored before resuming',
            code: 'session_archived'
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('returns 500 when the previous agent session does not reattach', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'error',
                message: 'Session failed to reattach to the previous agent session',
                code: 'resume_failed'
            }
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST'
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session failed to reattach to the previous agent session',
            code: 'resume_failed'
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('returns the renamed session snapshot from the rename route', async () => {
        const { app, renameSessionCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Renamed session' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            session: {
                id: 'session-1',
                metadata: {
                    name: 'Renamed session'
                },
                metadataVersion: 2
            }
        })
        expect(renameSessionCalls).toEqual([['session-1', 'Renamed session']])
    })

    it('deletes inactive sessions through the delete route', async () => {
        const { app, deleteSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(deleteSessionCalls).toEqual(['session-1'])
    })

    it('rejects deleting active sessions before reaching the engine', async () => {
        const { app, deleteSessionCalls } = createApp(createSession({ active: true }))

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Cannot delete active session. Archive it first.'
        })
        expect(deleteSessionCalls).toEqual([])
    })

    it('returns lifecycle conflicts from deleteSession as 409 instead of 500', async () => {
        const deleteSessionError = Object.assign(
            new Error('Manager-controlled member sessions can only be deleted by deleting the manager session'),
            { status: 409 }
        )
        const { app, deleteSessionCalls } = createApp(createSession({ active: false }), {
            deleteSessionError
        })

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE'
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Manager-controlled member sessions can only be deleted by deleting the manager session'
        })
        expect(deleteSessionCalls).toEqual(['session-1'])
    })

    it('returns store-backed recovery pages with explicit afterSeq paging', async () => {
        const { app, recoveryCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/recovery?afterSeq=12&limit=40')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            session: { id: 'session-1' },
            messages: [],
            page: {
                afterSeq: 12,
                nextAfterSeq: 12,
                limit: 40,
                hasMore: false
            }
        })
        expect(recoveryCalls).toEqual([
            ['session-1', { afterSeq: 12, limit: 40 }]
        ])
    })

    it('routes unarchive requests through unarchiveSession', async () => {
        const { app, unarchiveSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/unarchive', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'closed'
                }
            }
        })
        expect(unarchiveSessionCalls).toEqual(['session-1'])
    })

    it('keeps streaming sessions behind newer stable sessions in the list snapshot', async () => {
        const olderStreamingSession = createSession({
            id: 'session-streaming',
            updatedAt: 100,
            activeAt: 100,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                summary: {
                    text: 'Streaming title',
                    updatedAt: 1_000
                }
            }
        })
        const newerStableSession = createSession({
            id: 'session-stable',
            updatedAt: 200,
            activeAt: 200
        })
        const app = createSessionsListApp({
            sessions: [olderStreamingSession, newerStableSession],
            messageActivities: {
                'session-streaming': {
                    latestActivityAt: 500,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null
                }
            }
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                { id: 'session-stable', updatedAt: 200 },
                { id: 'session-streaming', updatedAt: 100, latestActivityAt: 500, latestActivityKind: 'reply' }
            ]
        })
    })

    it('does not move awaiting-input sessions ahead of newer stable sessions in the list snapshot', async () => {
        const olderAwaitingInputSession = createSession({
            id: 'session-awaiting-input',
            updatedAt: 500,
            activeAt: 100,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: 100
            },
            agentState: {
                controlledByUser: false,
                requests: {
                    'request-1': {
                        tool: 'read_file',
                        arguments: {},
                        createdAt: 150
                    }
                },
                completedRequests: {}
            }
        })
        const newerStableSession = createSession({
            id: 'session-stable',
            updatedAt: 200,
            activeAt: 200,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: 200
            }
        })
        const app = createSessionsListApp({
            sessions: [olderAwaitingInputSession, newerStableSession],
            messageActivities: {
                'session-awaiting-input': {
                    latestActivityAt: 150,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 150
                }
            }
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                { id: 'session-stable', updatedAt: 200, pendingRequestsCount: 0 },
                { id: 'session-awaiting-input', updatedAt: 500, pendingRequestsCount: 1, latestActivityKind: 'ready' }
            ]
        })
    })

    it('includes live config fields in the sessions list snapshot', async () => {
        const app = createSessionsListApp({
            sessions: [
                createSession({
                    id: 'session-live-config',
                    permissionMode: 'yolo',
                    collaborationMode: 'plan',
                    modelReasoningEffort: 'high'
                })
            ],
            messageActivities: {}
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                {
                    id: 'session-live-config',
                    permissionMode: 'yolo',
                    collaborationMode: 'plan',
                    modelReasoningEffort: 'high'
                }
            ]
        })
    })

    it('applies model changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.2' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'gpt-5.2'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { model: 'gpt-5.2' }]
        ])
    })

    it('rejects model changes for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.2' })
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Model selection can only be changed for Viby-managed Claude, Codex, Gemini, and Pi sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model changes for Viby-managed Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'opus' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'opus'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { model: 'opus' }]
        ])
    })

    it('applies model changes for Viby-managed Gemini sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'gemini'
            },
            model: null
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.5-flash-lite' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'gemini-2.5-flash-lite'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { model: 'gemini-2.5-flash-lite' }]
        ])
    })

    it('applies model reasoning effort changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'xhigh' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                modelReasoningEffort: 'xhigh'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { modelReasoningEffort: 'xhigh' }]
        ])
    })

    it('rejects model reasoning effort changes for unsupported session flavors', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'high' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Live model reasoning effort is only supported for Claude, Codex, and Pi sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model reasoning effort changes for Viby-managed Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'max' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                modelReasoningEffort: 'max'
            }
        })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { modelReasoningEffort: 'max' }]
        ])
    })

    it('rejects invalid Claude model reasoning effort values', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude'
            }
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'xhigh' })
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid model reasoning effort for session driver'
        })
        expect(applySessionConfigCalls).toEqual([])
    })
})
