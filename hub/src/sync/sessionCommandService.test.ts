import { describe, expect, it, mock } from 'bun:test'
import { getSessionCommandResumeStatus, SessionCommandError, SessionCommandService } from './sessionCommandService'

function createSession(overrides: Record<string, unknown> = {}) {
    return {
        id: 'session-1',
        active: true,
        thinking: true,
        metadata: { driver: 'claude' },
        ...overrides,
    }
}

function createService(options: { session?: ReturnType<typeof createSession> | null } = {}) {
    const session = options.session === undefined ? createSession() : options.session
    const sessionCache = {
        getSession: mock(() => session),
        refreshSession: mock(() => session),
        setSessionLifecycleState: mock(async () => session),
        setSessionThinking: mock(() => (session ? { ...session, thinking: false } : undefined)),
        applySessionConfig: mock(),
    }
    const rpcGateway = {
        abortSession: mock(async () => undefined),
    }
    const sessionLifecycleService = {
        closeSession: mock(async () => session),
        archiveSession: mock(async () => session),
        unarchiveSession: mock(async () => session),
        resumeSession: mock(async () => ({ type: 'success' as const, sessionId: 'session-1' })),
        switchSessionDriver: mock(async () => ({ type: 'success' as const, session: session!, targetDriver: 'codex' })),
    }
    const sessionRpcFacade = {
        requestSessionConfig: mock(async () => undefined),
    }
    return {
        service: new SessionCommandService(
            sessionCache as never,
            rpcGateway as never,
            sessionLifecycleService as never,
            sessionRpcFacade as never
        ),
        sessionCache,
        rpcGateway,
        sessionLifecycleService,
        sessionRpcFacade,
    }
}

describe('SessionCommandService', () => {
    it('aborts through the command owner and returns the authoritative snapshot', async () => {
        const { service, rpcGateway, sessionCache } = createService()

        await expect(service.executeSessionCommand({ type: 'abort', sessionId: 'session-1' })).resolves.toMatchObject({
            ok: true,
            session: { id: 'session-1', thinking: false },
        })
        expect(rpcGateway.abortSession).toHaveBeenCalledWith('session-1')
        expect(sessionCache.setSessionLifecycleState).toHaveBeenCalledWith('session-1', 'open', {
            touchUpdatedAt: false,
        })
    })

    it('rejects missing and inactive aborts before runtime mutation', async () => {
        const missing = createService({ session: null })
        await expect(
            missing.service.executeSessionCommand({ type: 'abort', sessionId: 'missing' })
        ).resolves.toMatchObject({
            ok: false,
            error: { code: 'session_not_found', status: 404 },
        })
        expect(missing.rpcGateway.abortSession).not.toHaveBeenCalled()

        const inactive = createService({ session: createSession({ active: false }) })
        await expect(
            inactive.service.executeSessionCommand({ type: 'abort', sessionId: 'session-1' })
        ).resolves.toMatchObject({
            ok: false,
            error: { code: 'session_action_failed', status: 409 },
        })
        expect(inactive.rpcGateway.abortSession).not.toHaveBeenCalled()
    })

    it('delegates driver-switch through the command owner', async () => {
        const { service, sessionLifecycleService } = createService()
        const hooks = { buildSessionHandoff: mock() }

        await service.executeSessionCommand({
            type: 'driver-switch',
            sessionId: 'session-1',
            targetDriver: 'codex',
            hooks,
        })
        expect(sessionLifecycleService.switchSessionDriver).toHaveBeenCalledWith('session-1', 'codex', hooks)
    })

    it('validates resume permission mode inside the command owner', async () => {
        const { service, sessionLifecycleService } = createService({
            session: createSession({ metadata: { driver: 'codex' } }),
        })

        await expect(
            service.executeSessionCommand({
                type: 'resume',
                sessionId: 'session-1',
                permissionMode: 'bypassPermissions',
            })
        ).resolves.toMatchObject({
            ok: false,
            error: { message: 'Invalid permission mode for session driver', code: 'session_action_failed' },
        })
        expect(sessionLifecycleService.resumeSession).not.toHaveBeenCalled()
    })

    it('applies Codex service tier only for active Viby-managed Codex sessions', async () => {
        const ready = createService({
            session: createSession({
                agentState: { controlledByUser: false, requests: {}, completedRequests: {} },
                metadata: { driver: 'codex' },
            }),
        })
        await ready.service.executeSessionCommand({
            type: 'codex-service-tier',
            sessionId: 'session-1',
            codexServiceTier: 'fast',
        })
        expect(ready.sessionRpcFacade.requestSessionConfig).toHaveBeenCalledWith('session-1', {
            codexServiceTier: 'fast',
        })

        const inactive = createService({ session: createSession({ active: false, metadata: { driver: 'codex' } }) })
        await expect(
            inactive.service.executeSessionCommand({
                type: 'codex-service-tier',
                sessionId: 'session-1',
                codexServiceTier: 'fast',
            })
        ).resolves.toMatchObject({ ok: false, error: { status: 409 } })

        const local = createService({
            session: createSession({
                agentState: { controlledByUser: true, requests: {}, completedRequests: {} },
                metadata: { driver: 'codex' },
            }),
        })
        await expect(
            local.service.executeSessionCommand({
                type: 'codex-service-tier',
                sessionId: 'session-1',
                codexServiceTier: 'fast',
            })
        ).resolves.toMatchObject({ ok: false, error: { status: 409 } })
    })

    it('keeps resume status as route mapping, not resume result payload', async () => {
        expect(getSessionCommandResumeStatus('session_archived')).toBe(409)
        expect(getSessionCommandResumeStatus('no_machine_online')).toBe(503)
        expect(getSessionCommandResumeStatus('session_action_failed')).toBe(400)
        expect(new SessionCommandError('x', 'session_action_failed', 400).status).toBe(400)
    })
})
