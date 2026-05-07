import { describe, expect, it } from 'bun:test'
import { createApp, createSession } from './sessions.support.test'

describe('session resume config routes', () => {
    it('applies permission mode changes and resume overrides for inactive sessions', async () => {
        const { app, applySessionConfigCalls, resumeSessionCalls } = createApp(
            createSession({
                active: false,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'claude',
                    runtimeHandles: { claude: { sessionId: 'claude-thread-1' } },
                },
            }),
            {
                resumeResult: {
                    type: 'success',
                    sessionId: 'session-1',
                },
            }
        )

        const configResponse = await app.request('/api/sessions/session-1/permission-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'bypassPermissions' }),
        })
        expect(configResponse.status).toBe(200)
        expect(applySessionConfigCalls).toEqual([['session-1', { permissionMode: 'bypassPermissions' }]])

        const resumeResponse = await app.request('/api/sessions/session-1/resume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ permissionMode: 'bypassPermissions' }),
        })
        expect(resumeResponse.status).toBe(200)
        expect(resumeSessionCalls).toEqual([['session-1', { permissionMode: 'bypassPermissions' }]])
    })

    it('rejects permission mode resume overrides that do not match the session driver', async () => {
        const { app, resumeSessionCalls } = createApp(
            createSession({
                active: false,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    driver: 'codex',
                    runtimeHandles: { codex: { sessionId: 'codex-thread-1' } },
                },
            })
        )

        const response = await app.request('/api/sessions/session-1/resume', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ permissionMode: 'bypassPermissions' }),
        })

        expect(response.status).toBe(400)
        expect(resumeSessionCalls).toEqual([])
    })
})
