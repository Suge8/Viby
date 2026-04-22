import { describe, expect, it } from 'bun:test'
import { createApp, createSession } from './sessions.support.test'

describe('sessions driver-switch availability route', () => {
    it('surfaces target_driver_unavailable switch failures without inventing local copy', async () => {
        const session = createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
            },
        })
        const { app } = createApp(session, {
            switchDriverResult: {
                type: 'error',
                message: 'Target driver is unavailable on this machine',
                code: 'target_driver_unavailable',
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
            error: 'Target driver is unavailable on this machine',
            code: 'target_driver_unavailable',
            stage: 'idle_gate',
            targetDriver: 'claude',
            rollbackResult: 'not_started',
            session: {
                ...session,
                resumeAvailable: false,
            },
        })
    })
})
