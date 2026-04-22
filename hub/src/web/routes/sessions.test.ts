import { describe, expect, it } from 'bun:test'
import { createApp, createSession, DEFAULT_PERMISSION_REQUEST_ID } from './sessions.support.test'
import { createSessionsListApp } from './sessionsList.support.test'

describe('sessions routes', () => {
    it('returns an authoritative session view snapshot for the selected session', async () => {
        const session = createSession({
            active: false,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'closed',
                lifecycleStateSince: 4,
            },
        })
        const latestWindowMessages = [
            {
                id: 'message-1',
                seq: 7,
                localId: null,
                createdAt: 7,
                content: {
                    role: 'assistant',
                    content: { type: 'text', text: 'latest' },
                },
            },
        ]
        const stream = {
            assistantTurnId: 'stream-1',
            startedAt: 8,
            updatedAt: 9,
            text: 'typing',
        }
        const { app } = createApp(session, {
            latestWindowMessages,
            latestWindowHasMore: true,
            stream,
        })

        const response = await app.request('/api/sessions/session-1/view')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            session: {
                ...session,
                resumeAvailable: false,
            },
            latestWindow: {
                messages: latestWindowMessages,
                page: {
                    limit: 50,
                    beforeSeq: null,
                    nextBeforeSeq: null,
                    hasMore: true,
                },
            },
            stream,
            watermark: {
                latestSeq: 7,
                updatedAt: session.updatedAt,
            },
            interactivity: {
                lifecycleState: 'closed',
                resumeAvailable: false,
                allowSendWhenInactive: false,
                retryAvailable: false,
            },
        })
    })

    it('returns the authoritative session snapshot when abort succeeds', async () => {
        const session = createSession({
            active: true,
            thinking: true,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                lifecycleState: 'running',
                lifecycleStateSince: 1,
            },
        })
        const abortedSession = {
            ...session,
            thinking: false,
            thinkingAt: 2,
        }
        const { app, abortSessionCalls } = createApp(session, {
            abortSessionResult: abortedSession,
        })

        const response = await app.request('/api/sessions/session-1/abort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({}),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            session: {
                ...abortedSession,
                resumeAvailable: false,
            },
        })
        expect(abortSessionCalls).toEqual(['session-1'])
    })

    it('returns the authoritative session snapshot when driver switching succeeds', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
            },
        })
        const { app, switchDriverCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'claude' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            targetDriver: 'claude',
            session: {
                id: 'session-1',
                metadata: {
                    driver: 'claude',
                },
            },
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
                driver: 'codex',
            },
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
                session,
            },
        })

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'claude' }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Driver switching requires an idle active session',
            code: 'session_not_idle',
            stage: 'idle_gate',
            targetDriver: 'claude',
            rollbackResult: 'not_started',
            session: {
                ...session,
                resumeAvailable: false,
            },
        })
        expect(switchDriverCalls).toEqual([['session-1', 'claude']])
    })

    it('accepts non-Claude/Codex drivers that are now covered by the same-session switch contract', async () => {
        const { app, switchDriverCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'gemini' }),
        })

        expect(response.status).toBe(200)
        expect(switchDriverCalls).toEqual([['session-1', 'gemini']])
    })

    it('rejects invalid driver-switch bodies before reaching the Hub contract', async () => {
        const { app, switchDriverCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/driver-switch', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ targetDriver: 'unknown' }),
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
                driver: 'cursor',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid permission mode for session driver',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('validates permission approvals against the authoritative driver', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor',
            },
            agentState: {
                controlledByUser: false,
                requests: {
                    [DEFAULT_PERMISSION_REQUEST_ID]: {
                        tool: 'shell',
                        arguments: {},
                        createdAt: 1,
                    },
                },
                completedRequests: {},
            },
        })
        const { app, approvePermissionCalls } = createApp(session)

        const response = await app.request(
            `/api/sessions/session-1/permissions/${DEFAULT_PERMISSION_REQUEST_ID}/approve`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ mode: 'read-only' }),
            }
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid permission mode for session driver',
        })
        expect(approvePermissionCalls).toEqual([])
    })

    it('lists command capabilities using the authoritative driver', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
            },
        })
        const commandCapabilitiesResult = {
            success: true,
            capabilities: [
                {
                    id: 'codex:builtin:new',
                    trigger: '/new',
                    label: '/new',
                    kind: 'native_command' as const,
                    source: 'builtin' as const,
                    provider: 'codex' as const,
                    sessionEffect: 'creates_session' as const,
                    requiresLifecycleOwner: true,
                    selectionMode: 'action' as const,
                    actionType: 'open_new_session' as const,
                    displayGroup: 'session' as const,
                    riskLevel: 'high' as const,
                },
            ],
        }
        const { app, listCommandCapabilitiesCalls } = createApp(session, {
            commandCapabilitiesResult,
        })

        const response = await app.request('/api/sessions/session-1/command-capabilities')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(commandCapabilitiesResult)
        expect(listCommandCapabilitiesCalls).toEqual([['session-1', 'codex', undefined]])
    })

    it('passes the cached revision through the command capability route for conditional fetches', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'gemini',
            },
        })
        const { app, listCommandCapabilitiesCalls } = createApp(session, {
            commandCapabilitiesResult: {
                success: true,
                revision: 'rev-1',
                notModified: true,
            },
        })

        const response = await app.request('/api/sessions/session-1/command-capabilities?revision=rev-1')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            success: true,
            revision: 'rev-1',
            notModified: true,
        })
        expect(listCommandCapabilitiesCalls).toEqual([['session-1', 'gemini', 'rev-1']])
    })

    it('lists resumable sessions through the lightweight summary route', async () => {
        const app = createSessionsListApp({
            sessions: [
                createSession({
                    id: 'session-closed',
                    active: false,
                    metadata: {
                        path: '/tmp/project-a',
                        host: 'localhost',
                        driver: 'codex',
                        startedBy: 'runner',
                        machineId: 'machine-1',
                        lifecycleState: 'closed',
                        lifecycleStateSince: 2,
                    },
                }),
                createSession({
                    id: 'session-archived',
                    active: false,
                    metadata: {
                        path: '/tmp/project-b',
                        host: 'localhost',
                        driver: 'claude',
                        machineId: 'machine-1',
                        lifecycleState: 'archived',
                        lifecycleStateSince: 3,
                    },
                }),
            ],
        })

        const response = await app.request('/api/sessions/resumable?query=project-a')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            revision: expect.any(String),
            sessions: [
                expect.objectContaining({
                    id: 'session-closed',
                    metadata: expect.objectContaining({
                        path: '/tmp/project-a',
                    }),
                    lifecycleState: 'closed',
                    resumeAvailable: true,
                }),
            ],
            page: {
                cursor: null,
                nextCursor: null,
                limit: 20,
                hasMore: false,
            },
        })
    })

    it('paginates resumable sessions with a stable nextCursor', async () => {
        const app = createSessionsListApp({
            sessions: [
                createSession({
                    id: 'session-newer',
                    active: false,
                    updatedAt: 20,
                    metadata: {
                        path: '/tmp/project-newer',
                        host: 'localhost',
                        driver: 'codex',
                        startedBy: 'runner',
                        machineId: 'machine-1',
                        lifecycleState: 'closed',
                        lifecycleStateSince: 20,
                    },
                }),
                createSession({
                    id: 'session-older',
                    active: false,
                    updatedAt: 10,
                    metadata: {
                        path: '/tmp/project-older',
                        host: 'localhost',
                        driver: 'codex',
                        startedBy: 'runner',
                        machineId: 'machine-1',
                        lifecycleState: 'closed',
                        lifecycleStateSince: 10,
                    },
                }),
            ],
        })

        const firstPage = await app.request('/api/sessions/resumable?limit=1')
        expect(firstPage.status).toBe(200)
        expect(await firstPage.json()).toEqual({
            revision: expect.any(String),
            sessions: [
                expect.objectContaining({
                    id: 'session-newer',
                }),
            ],
            page: {
                cursor: null,
                nextCursor: 'session-newer',
                limit: 1,
                hasMore: true,
            },
        })

        const secondPage = await app.request('/api/sessions/resumable?limit=1&cursor=session-newer')
        expect(secondPage.status).toBe(200)
        expect(await secondPage.json()).toEqual({
            revision: expect.any(String),
            sessions: [
                expect.objectContaining({
                    id: 'session-older',
                }),
            ],
            page: {
                cursor: 'session-newer',
                nextCursor: null,
                limit: 1,
                hasMore: false,
            },
        })
    })

    it('passes the cached revision through the resumable sessions route for conditional fetches', async () => {
        const app = createSessionsListApp({
            sessions: [
                createSession({
                    id: 'session-closed',
                    active: false,
                    metadata: {
                        path: '/tmp/project-a',
                        host: 'localhost',
                        driver: 'codex',
                        startedBy: 'runner',
                        machineId: 'machine-1',
                        lifecycleState: 'closed',
                        lifecycleStateSince: 2,
                    },
                }),
            ],
        })

        const initialResponse = await app.request('/api/sessions/resumable')
        expect(initialResponse.status).toBe(200)
        const initialJson = (await initialResponse.json()) as { revision: string }
        expect(initialJson.revision).toEqual(expect.any(String))

        const response = await app.request(`/api/sessions/resumable?revision=${initialJson.revision}`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            revision: initialJson.revision,
            notModified: true,
        })
    })

    it('rejects collaboration mode changes when the resolved driver is not codex', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode is only supported for Codex sessions',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {},
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode can only be changed for Viby-managed Codex sessions',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('rejects collaboration mode changes for non-Codex sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Collaboration mode is only supported for Codex sessions',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies collaboration mode changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                collaborationMode: 'plan',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { collaborationMode: 'plan' }]])
    })

    it('returns the updated session snapshot after permission mode changes', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                permissionMode: 'read-only',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { permissionMode: 'read-only' }]])
    })

    it('fails when the updated live config snapshot is unavailable', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession(), {
            dropSessionSnapshotAfterConfig: true,
        })

        const response = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'read-only' }),
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session snapshot unavailable after config update',
            code: 'session_not_found',
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { permissionMode: 'read-only' }]])
    })

    it('allows archiving inactive sessions', async () => {
        const { app, archiveSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/archive', {
            method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'archived',
                },
            },
        })
        expect(archiveSessionCalls).toEqual(['session-1'])
    })

    it('routes close requests through closeSession', async () => {
        const { app, closeSessionCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/close', {
            method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'closed',
                },
            },
        })
        expect(closeSessionCalls).toEqual(['session-1'])
    })

    it('returns the resumed session snapshot when the synchronous resume contract succeeds', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'success',
                sessionId: 'session-1',
            },
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            type: 'success',
            session: {
                ...createSession({
                    active: true,
                    activeAt: 2,
                    updatedAt: 2,
                    metadata: {
                        path: '/tmp/project',
                        host: 'localhost',
                        driver: 'codex',
                        lifecycleState: 'running',
                        lifecycleStateSince: 2,
                    },
                }),
                resumeAvailable: false,
            },
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('returns 409 when resuming an archived session is rejected', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'error',
                message: 'Archived sessions must be restored before resuming',
                code: 'session_archived',
            },
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST',
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Archived sessions must be restored before resuming',
            code: 'session_archived',
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('returns 500 when the previous agent session does not reattach', async () => {
        const { app, resumeSessionCalls } = createApp(createSession({ active: false }), {
            resumeResult: {
                type: 'error',
                message: 'Session failed to reattach to the previous agent session',
                code: 'resume_failed',
            },
        })

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST',
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session failed to reattach to the previous agent session',
            code: 'resume_failed',
        })
        expect(resumeSessionCalls).toEqual(['session-1'])
    })

    it('keeps handleless closed Codex detail snapshots read-only on the session snapshot route', async () => {
        const { app } = createApp(
            createSession({
                active: false,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    codexSessionId: 'thread-1',
                    lifecycleState: 'closed',
                    lifecycleStateSince: 1,
                },
            })
        )

        const response = await app.request('/api/sessions/session-1')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            session: {
                id: 'session-1',
                active: false,
                resumeAvailable: false,
                metadata: {
                    codexSessionId: 'thread-1',
                    lifecycleState: 'closed',
                },
            },
        })
    })

    it('returns the renamed session snapshot from the rename route', async () => {
        const { app, renameSessionCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Renamed session' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            session: {
                id: 'session-1',
                metadata: {
                    name: 'Renamed session',
                },
                metadataVersion: 2,
            },
        })
        expect(renameSessionCalls).toEqual([['session-1', 'Renamed session']])
    })

    it('deletes inactive sessions through the delete route', async () => {
        const { app, deleteSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE',
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(deleteSessionCalls).toEqual(['session-1'])
    })

    it('rejects deleting active sessions before reaching the engine', async () => {
        const { app, deleteSessionCalls } = createApp(createSession({ active: true }))

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE',
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Cannot delete active session. Archive it first.',
        })
        expect(deleteSessionCalls).toEqual([])
    })

    it('returns lifecycle conflicts from deleteSession as 409 instead of 500', async () => {
        const deleteSessionError = Object.assign(new Error('Session delete is already in progress'), { status: 409 })
        const { app, deleteSessionCalls } = createApp(createSession({ active: false }), {
            deleteSessionError,
        })

        const response = await app.request('/api/sessions/session-1', {
            method: 'DELETE',
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Session delete is already in progress',
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
                hasMore: false,
            },
        })
        expect(recoveryCalls).toEqual([['session-1', { afterSeq: 12, limit: 40 }]])
    })

    it('routes unarchive requests through unarchiveSession', async () => {
        const { app, unarchiveSessionCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/unarchive', {
            method: 'POST',
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                active: false,
                metadata: {
                    lifecycleState: 'closed',
                },
            },
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
                    updatedAt: 1_000,
                },
            },
        })
        const newerStableSession = createSession({
            id: 'session-stable',
            updatedAt: 200,
            activeAt: 200,
        })
        const app = createSessionsListApp({
            sessions: [olderStreamingSession, newerStableSession],
            messageActivities: {
                'session-streaming': {
                    latestActivityAt: 500,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null,
                },
            },
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                { id: 'session-stable', updatedAt: 200 },
                { id: 'session-streaming', updatedAt: 100, latestActivityAt: 500, latestActivityKind: 'reply' },
            ],
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
                lifecycleStateSince: 100,
            },
            agentState: {
                controlledByUser: false,
                requests: {
                    'request-1': {
                        tool: 'read_file',
                        arguments: {},
                        createdAt: 150,
                    },
                },
                completedRequests: {},
            },
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
                lifecycleStateSince: 200,
            },
        })
        const app = createSessionsListApp({
            sessions: [olderAwaitingInputSession, newerStableSession],
            messageActivities: {
                'session-awaiting-input': {
                    latestActivityAt: 150,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 150,
                },
            },
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                { id: 'session-stable', updatedAt: 200, pendingRequestsCount: 0 },
                { id: 'session-awaiting-input', updatedAt: 500, pendingRequestsCount: 1, latestActivityKind: 'ready' },
            ],
        })
    })

    it('includes live config fields in the sessions list snapshot', async () => {
        const app = createSessionsListApp({
            sessions: [
                createSession({
                    id: 'session-live-config',
                    permissionMode: 'yolo',
                    collaborationMode: 'plan',
                    modelReasoningEffort: 'high',
                }),
            ],
            messageActivities: {},
        })

        const response = await app.request('/api/sessions')

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            sessions: [
                {
                    id: 'session-live-config',
                    permissionMode: 'yolo',
                    collaborationMode: 'plan',
                    modelReasoningEffort: 'high',
                },
            ],
        })
    })

    it('applies model changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.2' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'gpt-5.2',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { model: 'gpt-5.2' }]])
    })

    it('rejects model changes for local Codex sessions', async () => {
        const session = createSession({
            agentState: {
                controlledByUser: true,
                requests: {},
                completedRequests: {},
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.2' }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Model selection can only be changed for Viby-managed Claude, Codex, Gemini, and Pi sessions',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model changes for Viby-managed Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'opus' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'opus',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { model: 'opus' }]])
    })

    it('applies model changes for Viby-managed Gemini sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'gemini',
            },
            model: null,
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.5-flash-lite' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                model: 'gemini-2.5-flash-lite',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { model: 'gemini-2.5-flash-lite' }]])
    })

    it('applies model reasoning effort changes for Viby-managed Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession())

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'xhigh' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                modelReasoningEffort: 'xhigh',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { modelReasoningEffort: 'xhigh' }]])
    })

    it('rejects model reasoning effort changes for unsupported session flavors', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'cursor',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'high' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Live model reasoning effort is only supported for Claude, Codex, and Pi sessions',
        })
        expect(applySessionConfigCalls).toEqual([])
    })

    it('applies model reasoning effort changes for Viby-managed Claude sessions', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'max' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({
            ok: true,
            session: {
                id: 'session-1',
                modelReasoningEffort: 'max',
            },
        })
        expect(applySessionConfigCalls).toEqual([['session-1', { modelReasoningEffort: 'max' }]])
    })

    it('rejects invalid Claude model reasoning effort values', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
            },
        })
        const { app, applySessionConfigCalls } = createApp(session)

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'xhigh' }),
        })

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            error: 'Invalid model reasoning effort for session driver',
        })
        expect(applySessionConfigCalls).toEqual([])
    })
})
