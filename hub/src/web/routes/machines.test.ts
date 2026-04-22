import { describe, expect, it } from 'bun:test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Session } from '@viby/protocol/types'
import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createRuntimeRoutes } from './runtime'

function getLocalVibyHomeDir(): string {
    return process.env.VIBY_HOME ? process.env.VIBY_HOME.replace(/^~/, homedir()) : join(homedir(), '.viby')
}

function localRuntime(active: boolean = true) {
    return [
        {
            id: 'machine-1',
            active,
            activeAt: 1,
            createdAt: 1,
            updatedAt: 1,
            metadata: {
                host: 'localhost',
                platform: 'darwin',
                vibyCliVersion: '0.1.0',
                homeDir: homedir(),
                vibyHomeDir: getLocalVibyHomeDir(),
            },
        },
    ]
}

function readyAgentAvailability() {
    return {
        agents: [
            { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'copilot', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'cursor', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'gemini', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'opencode', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'pi', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
        ],
    }
}

describe('runtime routes', () => {
    it('returns the local runtime snapshot', async () => {
        const engine = {
            getMachines: () => localRuntime(),
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            runtime: expect.objectContaining({
                id: 'machine-1',
                active: true,
            }),
        })
    })

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
                machineId: 'machine-1',
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
            todos: undefined,
        }
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async () => readyAgentAvailability(),
            spawnSession: async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                return { type: 'success', sessionId: 'session-1' }
            },
            ensureSessionDriver: async () => spawnedSession,
            getSession: () => spawnedSession,
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'codex',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
                sessionType: 'simple',
            }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ type: 'success', session: spawnedSession })
        expect(spawnCalls).toEqual([
            {
                machineId: 'machine-1',
                directory: '/tmp/project',
                agent: 'codex',
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
                sessionType: 'simple',
                worktreeName: undefined,
            },
        ])
    })

    it('returns 500 when spawn succeeds but the session snapshot is unavailable', async () => {
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async () => readyAgentAvailability(),
            spawnSession: async () => ({ type: 'success', sessionId: 'session-1' }),
            ensureSessionDriver: async () => null,
            getSession: () => undefined,
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ directory: '/tmp/project' }),
        })

        expect(response.status).toBe(500)
        expect(await response.json()).toEqual({
            error: 'Session snapshot unavailable after spawn',
            code: 'session_not_found',
        })
    })

    it('accepts pi as a spawn agent flavor', async () => {
        const spawnCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async () => readyAgentAvailability(),
            spawnSession: async (options: Record<string, unknown>) => {
                spawnCalls.push(options)
                return { type: 'error', errorMessage: 'expected test stop' }
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'pi',
                modelReasoningEffort: 'medium',
            }),
        })

        expect(response.status).toBe(200)
        expect(spawnCalls[0]?.agent).toBe('pi')
    })

    it('returns authoritative runtime agent availability from the local runtime owner', async () => {
        const availabilityCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async (machineId: string, request: Record<string, unknown>) => {
                availabilityCalls.push({ machineId, ...request })
                return readyAgentAvailability()
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/agent-availability?directory=%2Ftmp%2Fproject')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(readyAgentAvailability())
        expect(availabilityCalls).toEqual([
            { machineId: 'machine-1', directory: '/tmp/project', forceRefresh: undefined },
        ])
    })

    it('forwards forceRefresh on authoritative runtime agent availability checks', async () => {
        const availabilityCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async (machineId: string, request: Record<string, unknown>) => {
                availabilityCalls.push({ machineId, ...request })
                return readyAgentAvailability()
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request(
            '/api/runtime/agent-availability?directory=%2Ftmp%2Fproject&forceRefresh=true'
        )

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(readyAgentAvailability())
        expect(availabilityCalls).toEqual([{ machineId: 'machine-1', directory: '/tmp/project', forceRefresh: true }])
    })

    it('preserves forceRefresh=false when parsing authoritative runtime availability queries', async () => {
        const availabilityCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async (machineId: string, request: Record<string, unknown>) => {
                availabilityCalls.push({ machineId, ...request })
                return readyAgentAvailability()
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/agent-availability?forceRefresh=false')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual(readyAgentAvailability())
        expect(availabilityCalls).toEqual([{ machineId: 'machine-1', directory: undefined, forceRefresh: false }])
    })

    it('rejects spawn when the selected agent is unavailable on this machine', async () => {
        const engine = {
            getMachines: () => localRuntime(),
            listAgentAvailability: async () => ({
                agents: [
                    {
                        driver: 'claude',
                        status: 'not_installed',
                        resolution: 'install',
                        code: 'command_missing',
                        detectedAt: 1,
                    },
                ],
            }),
            spawnSession: async () => ({ type: 'success', sessionId: 'should-not-run' }),
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/spawn', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                directory: '/tmp/project',
                agent: 'claude',
            }),
        })

        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({
            error: 'Selected agent is unavailable on this machine',
            code: 'agent_unavailable',
            agent: 'claude',
            availability: {
                driver: 'claude',
                status: 'not_installed',
                resolution: 'install',
                code: 'command_missing',
                detectedAt: 1,
            },
        })
    })

    it('resolves directory-aware agent launch config through the runtime RPC owner', async () => {
        const launchConfigCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            resolveAgentLaunchConfig: async (machineId: string, request: Record<string, unknown>) => {
                launchConfigCalls.push({ machineId, ...request })
                return {
                    type: 'success',
                    config: {
                        agent: 'pi',
                        defaultModel: 'openai/gpt-5.4',
                        defaultModelReasoningEffort: 'high',
                        availableModels: [
                            {
                                id: 'openai/gpt-5.4',
                                label: 'GPT-5.4',
                                supportedThinkingLevels: ['none', 'low', 'high'],
                            },
                        ],
                    },
                }
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/agent-launch-config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                agent: 'pi',
                directory: '/tmp/project',
            }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            type: 'success',
            config: {
                agent: 'pi',
                defaultModel: 'openai/gpt-5.4',
                defaultModelReasoningEffort: 'high',
                availableModels: [
                    {
                        id: 'openai/gpt-5.4',
                        label: 'GPT-5.4',
                        supportedThinkingLevels: ['none', 'low', 'high'],
                    },
                ],
            },
        })
        expect(launchConfigCalls).toEqual([
            {
                machineId: 'machine-1',
                agent: 'pi',
                directory: '/tmp/project',
            },
        ])
    })

    it('lists recoverable local sessions through the local runtime owner', async () => {
        const listCalls: Array<Record<string, unknown>> = []
        const engine = {
            getMachines: () => localRuntime(),
            listLocalSessions: async (machineId: string, request: Record<string, unknown>) => {
                listCalls.push({ machineId, ...request })
                return {
                    capabilities: [{ driver: 'claude', supported: true }],
                    sessions: [
                        {
                            driver: 'claude',
                            providerSessionId: 'claude-session-1',
                            title: 'Recovered Claude Session',
                            path: '/tmp/project',
                            startedAt: 1,
                            updatedAt: 2,
                            messageCount: 3,
                        },
                    ],
                }
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/local-sessions?path=%2Ftmp%2Fproject&driver=claude')

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            capabilities: [{ driver: 'claude', supported: true }],
            sessions: [
                {
                    driver: 'claude',
                    providerSessionId: 'claude-session-1',
                    title: 'Recovered Claude Session',
                    path: '/tmp/project',
                    startedAt: 1,
                    updatedAt: 2,
                    messageCount: 3,
                },
            ],
        })
        expect(listCalls).toEqual([
            {
                machineId: 'machine-1',
                driver: 'claude',
                path: '/tmp/project',
            },
        ])
    })

    it('imports a local runtime session through the runtime owner', async () => {
        const importCalls: Array<Record<string, unknown>> = []
        const recoveredSession: Session = {
            id: 'session-recovered',
            seq: 1,
            createdAt: 1_000,
            updatedAt: 2_000,
            active: false,
            activeAt: 2_000,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                driver: 'claude',
                machineId: 'machine-1',
                lifecycleState: 'closed',
                lifecycleStateSince: 2_000,
            },
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 2_000,
            model: null,
            modelReasoningEffort: null,
            todos: undefined,
        }
        const engine = {
            getMachines: () => localRuntime(),
            importLocalSession: async (machineId: string, request: Record<string, unknown>) => {
                importCalls.push({ machineId, ...request })
                return {
                    session: recoveredSession,
                    imported: true,
                }
            },
        } as unknown as Partial<SyncEngine>

        const app = new Hono<WebAppEnv>()
        app.route(
            '/api',
            createRuntimeRoutes(() => engine as SyncEngine)
        )

        const response = await app.request('/api/runtime/local-sessions/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                path: '/tmp/project',
                driver: 'claude',
                providerSessionId: 'claude-session-1',
            }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            session: recoveredSession,
            imported: true,
        })
        expect(importCalls).toEqual([
            {
                machineId: 'machine-1',
                path: '/tmp/project',
                driver: 'claude',
                providerSessionId: 'claude-session-1',
            },
        ])
    })
})
