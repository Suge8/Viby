import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMachinesRoutes } from './machines'

describe('machines routes', () => {
    it('forwards spawn permission and collaboration config through a single request object', async () => {
        const spawnCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachine: () => ({
                id: 'machine-1',
                active: true,
                activeAt: 1,
                metadata: {
                    host: 'localhost',
                    platform: 'darwin',
                    vibyCliVersion: '0.1.0'
                }
            }),
            spawnSession: async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                return { type: 'success', sessionId: 'session-1' }
            }
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'codex',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
                sessionType: 'simple'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ type: 'success', sessionId: 'session-1' })
        expect(spawnCalls).toEqual([{
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'codex',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
            sessionType: 'simple',
            worktreeName: undefined
        }])
    })
})
