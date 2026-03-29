import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import type { EnhancedMode } from './loop'

const harness = vi.hoisted(() => ({
    spawnCalls: [] as Array<{ command: string; args: string[]; cwd?: string; env?: Record<string, string> }>,
    rpcHandlers: new Map<string, (params: unknown) => unknown>(),
    ensureCursorConfigCalls: [] as Array<{ sessionId: string; command: string; args: string[] }>,
    remoteBridgeCalls: 0
}))

vi.mock('react', () => ({
    default: {
        createElement: vi.fn(() => null)
    }
}))

vi.mock('node:child_process', () => ({
    spawn: vi.fn((command: string, args: string[], options: { cwd?: string; env?: Record<string, string> }) => {
        harness.spawnCalls.push({
            command,
            args,
            cwd: options.cwd,
            env: options.env
        })

        const child = new EventEmitter() as EventEmitter & {
            stdout: Readable
            stderr: EventEmitter
            kill: ReturnType<typeof vi.fn>
        }
        child.stdout = Readable.from([])
        child.stderr = new EventEmitter()
        child.kill = vi.fn()

        queueMicrotask(() => {
            child.emit('exit', 0, null)
        })

        return child
    })
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn()
    }
}))

vi.mock('@/agent/messageConverter', () => ({
    convertAgentMessage: vi.fn(() => null)
}))

vi.mock('./utils/cursorConfig', () => ({
    ensureCursorConfig: vi.fn((sessionId: string, mcpServer: { command: string; args: string[] }) => {
        harness.ensureCursorConfigCalls.push({
            sessionId,
            command: mcpServer.command,
            args: mcpServer.args
        });
        return {
            configDir: `/tmp/cursor-config/${sessionId}`,
            mcpConfigPath: `/tmp/cursor-config/${sessionId}/mcp.json`
        };
    }),
    buildCursorProcessEnv: vi.fn((configDir: string) => ({
        CURSOR_CONFIG_DIR: configDir
    }))
}))

vi.mock('@/modules/common/remote/RemoteLauncherBase', () => ({
    RemoteLauncherBase: class {
        protected readonly messageBuffer = {
            addMessage() {},
            clear() {}
        }
        protected readonly hasTTY = false
        protected readonly logPath?: string
        protected exitReason: 'switch' | 'exit' | null = null
        protected shouldExit = false

        constructor(logPath?: string) {
            this.logPath = logPath
        }

        protected setupAbortHandlers(
            rpcHandlerManager: { registerHandler: (method: string, handler: (params: unknown) => unknown) => void },
            handlers: { onAbort: () => Promise<void> | void; onSwitch: () => Promise<void> | void }
        ): void {
            rpcHandlerManager.registerHandler('abort', handlers.onAbort)
            rpcHandlerManager.registerHandler('switch', handlers.onSwitch)
        }

        protected clearAbortHandlers(
            rpcHandlerManager: { registerHandler: (method: string, handler: (params: unknown) => unknown) => void }
        ): void {
            rpcHandlerManager.registerHandler('abort', async () => {})
            rpcHandlerManager.registerHandler('switch', async () => {})
        }

        protected async requestExit(
            reason: 'switch' | 'exit',
            handler: () => Promise<void> | void
        ): Promise<void> {
            if (!this.exitReason) {
                this.exitReason = reason
            }
            this.shouldExit = true
            await handler()
        }

        protected async start(): Promise<'switch' | 'exit'> {
            try {
                await (this as unknown as { runMainLoop: () => Promise<void> }).runMainLoop()
            } finally {
                await (this as unknown as { cleanup: () => Promise<void> }).cleanup()
            }
            return this.exitReason ?? 'exit'
        }
    }
}))

import { cursorRemoteLauncher } from './cursorRemoteLauncher'

function createMode(): EnhancedMode {
    return {
        permissionMode: 'default'
    }
}

function createSessionStub() {
    const queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode))
    queue.push('ship the task', createMode())
    queue.close()

    return {
        path: '/tmp/viby-cursor',
        logPath: '/tmp/viby-cursor/test.log',
        sessionId: null as string | null,
        queue,
        model: 'gpt-5.4-mini',
        ensureRemoteBridge: async () => {
            harness.remoteBridgeCalls += 1
            return {
                server: {
                    stop: vi.fn()
                },
                mcpServers: {
                    viby: {
                        command: 'viby',
                        args: ['mcp', '--tool', 'team_get_snapshot']
                    }
                }
            }
        },
        client: {
            sessionId: 'viby-session-1',
            getTeamContextSnapshot() {
                return {
                    projectId: 'project-1',
                    sessionRole: 'manager',
                    managerSessionId: 'manager-session-1',
                    projectStatus: 'active'
                }
            },
            rpcHandlerManager: {
                registerHandler(method: string, handler: (params: unknown) => unknown) {
                    harness.rpcHandlers.set(method, handler)
                }
            }
        },
        getPermissionMode() {
            return 'default' as const
        },
        onSessionFound(id: string) {
            this.sessionId = id
        },
        sendCodexMessage() {},
        sendSessionEvent() {},
        onThinkingChange() {}
    }
}

describe('cursorRemoteLauncher', () => {
    afterEach(() => {
        harness.spawnCalls = []
        harness.rpcHandlers.clear()
        harness.ensureCursorConfigCalls = []
        harness.remoteBridgeCalls = 0
    })

    it('prepends the authoritative team role contract and injects the session-scoped MCP config before the first remote prompt', async () => {
        const session = createSessionStub()

        const exitReason = await cursorRemoteLauncher(session as never)

        expect(exitReason).toBe('exit')
        expect(harness.spawnCalls).toHaveLength(1)
        expect(harness.spawnCalls[0]?.command).toBe('agent')
        expect(harness.spawnCalls[0]?.cwd).toBe('/tmp/viby-cursor')
        expect(harness.remoteBridgeCalls).toBe(1)
        expect(harness.ensureCursorConfigCalls).toEqual([{
            sessionId: 'viby-session-1',
            command: 'viby',
            args: ['mcp', '--tool', 'team_get_snapshot']
        }])
        const promptIndex = harness.spawnCalls[0]?.args.indexOf('-p') ?? -1
        expect(promptIndex).toBeGreaterThanOrEqual(0)
        const promptText = promptIndex >= 0 ? harness.spawnCalls[0]?.args[promptIndex + 1] : ''
        expect(promptText).toContain('manager session')
        expect(promptText).toContain('final acceptance')
        expect(promptText).toContain('ship the task')
        expect(harness.spawnCalls[0]?.env?.CURSOR_CONFIG_DIR).toBe(
            '/tmp/cursor-config/viby-session-1'
        )
    })
})
