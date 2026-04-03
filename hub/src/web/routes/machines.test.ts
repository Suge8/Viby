import { describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import type { Session } from '@viby/protocol/types'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createMachinesRoutes } from './machines'

describe('machines routes', () => {
    it('forwards spawn permission and collaboration config through a single request object', async () => {
        const spawnCalls: Array<Record<string, unknown>> = []
        const spawnedSession: Session = {
            id: 'session-1',
            seq: 1,
            createdAt: 1_000,
            updatedAt: 1_000,
            active: true,
            activeAt: 1_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'codex',
                machineId: 'machine-1'
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 1_000,
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
            todos: undefined
        }
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
            },
            ensureSessionDriver: async (sessionId: string) => spawnedSession,
            getSession: () => spawnedSession
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
                sessionRole: 'manager',
                collaborationMode: 'plan',
                sessionType: 'simple'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ type: 'success', session: spawnedSession })
        expect(spawnCalls).toEqual([{
            machineId: 'machine-1',
            directory: '/tmp/project',
            agent: 'codex',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            sessionRole: 'manager',
            collaborationMode: 'plan',
            sessionType: 'simple',
            worktreeName: undefined
        }])
    })

    it('returns 500 when spawn succeeds but the session snapshot is unavailable', async () => {
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
            spawnSession: async () => ({ type: 'success', sessionId: 'session-1' }),
            ensureSessionDriver: async () => null,
            getSession: () => undefined
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directory: '/tmp/project' })
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session snapshot unavailable after spawn',
            code: 'session_not_found'
        })
    })

    it('accepts pi as a spawn agent flavor', async () => {
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
                return { type: 'error', errorMessage: 'expected test stop' }
            }
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'pi',
                modelReasoningEffort: 'medium'
            })
        })

        expect(response.status).toBe(200)
        expect(spawnCalls[0]?.agent).toBe('pi')
    })

    it('resolves directory-aware agent launch config through the machine RPC owner', async () => {
        const launchConfigCalls: Array<Record<string, unknown>> = []
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
            resolveAgentLaunchConfig: async (machineId: string, request: Record<string, unknown>) => {
                launchConfigCalls.push({ machineId, ...request })
                return {
                    type: 'success',
                    config: {
                        agent: 'pi',
                        defaultModel: 'openai/gpt-5.4',
                        defaultModelReasoningEffort: 'high',
                        availableModels: [{
                            id: 'openai/gpt-5.4',
                            label: 'GPT-5.4',
                            supportedThinkingLevels: ['none', 'low', 'high']
                        }]
                    }
                }
            }
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route('/api', createMachinesRoutes(() => engine as SyncEngine))

        const response = await app.request('/api/machines/machine-1/agent-launch-config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                agent: 'pi',
                directory: '/tmp/project'
            })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            type: 'success',
            config: {
                agent: 'pi',
                defaultModel: 'openai/gpt-5.4',
                defaultModelReasoningEffort: 'high',
                availableModels: [{
                    id: 'openai/gpt-5.4',
                    label: 'GPT-5.4',
                    supportedThinkingLevels: ['none', 'low', 'high']
                }]
            }
        })
        expect(launchConfigCalls).toEqual([{
            machineId: 'machine-1',
            agent: 'pi',
            directory: '/tmp/project'
        }])
    })
})
