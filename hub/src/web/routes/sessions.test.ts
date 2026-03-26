import { describe, expect, it } from 'bun:test'
import type { SessionMessageActivity } from '@viby/protocol/types'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSessionsRoutes } from './sessions'

function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        flavor: 'codex' as const
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
        resumeResult?: Awaited<ReturnType<SyncEngine['resumeSession']>>
        dropSessionSnapshotAfterConfig?: boolean
    }
) {
    const abortSessionCalls: string[] = []
    const applySessionConfigCalls: Array<[string, Record<string, unknown>]> = []
    const archiveSessionCalls: string[] = []
    const closeSessionCalls: string[] = []
    const recoveryCalls: Array<[string, { afterSeq: number; limit: number }]> = []
    const resumeSessionCalls: string[] = []
    const switchSessionCalls: Array<[string, 'remote' | 'local']> = []
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
        switchSession: async (sessionId: string, to: 'remote' | 'local') => {
            switchSessionCalls.push([sessionId, to])
            currentSession = {
                ...currentSession,
                agentState: {
                    ...(currentSession.agentState ?? {}),
                    controlledByUser: to === 'local'
                },
                agentStateVersion: currentSession.agentStateVersion + 1
            }
            return currentSession
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

    return {
        app,
        abortSessionCalls,
        applySessionConfigCalls,
        archiveSessionCalls,
        closeSessionCalls,
        recoveryCalls,
        resumeSessionCalls,
        switchSessionCalls,
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
                flavor: 'codex',
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

    it('returns the authoritative session snapshot when switching to remote succeeds', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {}
            }
        })
        const { app, switchSessionCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/switch', {
            method: 'POST'
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                agentState: {
                    controlledByUser: false
                }
            }
        })
        expect(switchSessionCalls).toEqual([['session-1', 'remote']])
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
            error: 'Collaboration mode can only be changed for remote Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for non-Codex sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude'
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

    it('applies collaboration mode changes for remote Codex sessions', async () => {
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
                    flavor: 'codex',
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
                flavor: 'claude',
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
                flavor: 'codex',
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
                flavor: 'codex',
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

    it('applies model changes for remote Codex sessions', async () => {
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
            error: 'Model selection can only be changed for remote Claude, Codex, and Gemini sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model changes for remote Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude'
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

    it('applies model changes for remote Gemini sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'gemini'
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

    it('applies model reasoning effort changes for remote Codex sessions', async () => {
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
                flavor: 'cursor'
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
            error: 'Live model reasoning effort is only supported for Claude and Codex sessions'
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model reasoning effort changes for remote Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                flavor: 'claude'
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
                flavor: 'claude'
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
            error: 'Invalid model reasoning effort for session flavor'
        })
        expect(applySessionConfigCalls).toEqual([])
    })
})
