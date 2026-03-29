import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    launches: [] as Array<Record<string, unknown>>,
    ensureCursorConfigCalls: [] as Array<{ sessionId: string; command: string; args: string[] }>,
    remoteBridgeCalls: 0
}));

vi.mock('./cursorLocal', () => ({
    cursorLocal: async (opts: Record<string, unknown>) => {
        harness.launches.push(opts);
    }
}));

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
}));

vi.mock('@/modules/common/launcher/BaseLocalLauncher', () => ({
    BaseLocalLauncher: class {
        constructor(private readonly opts: { launch: (signal: AbortSignal) => Promise<void> }) {}

        async run(): Promise<'exit'> {
            await this.opts.launch(new AbortController().signal);
            return 'exit';
        }
    }
}));

import { cursorLocalLauncher } from './cursorLocalLauncher';

function createQueueStub() {
    return {
        size: () => 0,
        reset: () => {},
        setOnMessage: () => {}
    };
}

function createSessionStub() {
    return {
        sessionId: null,
        path: '/tmp/viby-cursor',
        startedBy: 'terminal' as const,
        startingMode: 'local' as const,
        cursorArgs: ['--foo'],
        model: 'gpt-5.4-mini',
        ensureRemoteBridge: async () => {
            harness.remoteBridgeCalls += 1;
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
            };
        },
        client: {
            sessionId: 'viby-session-1',
            rpcHandlerManager: {
                registerHandler: () => {}
            }
        },
        getPermissionMode: () => 'default' as const,
        onSessionFound: () => {},
        sendSessionEvent: () => {},
        recordLocalLaunchFailure: () => {},
        sendUserMessage: () => {},
        sendCodexMessage: () => {},
        queue: createQueueStub()
    };
}

describe('cursorLocalLauncher', () => {
    afterEach(() => {
        harness.launches = [];
        harness.ensureCursorConfigCalls = [];
        harness.remoteBridgeCalls = 0;
    });

    it('injects the session-scoped Cursor MCP config into local launches', async () => {
        const session = createSessionStub();

        await cursorLocalLauncher(session as never);

        expect(harness.remoteBridgeCalls).toBe(1);
        expect(harness.ensureCursorConfigCalls).toEqual([{
            sessionId: 'viby-session-1',
            command: 'viby',
            args: ['mcp', '--tool', 'team_get_snapshot']
        }]);
        expect(harness.launches).toHaveLength(1);
        expect(harness.launches[0]?.env).toMatchObject({
            CURSOR_CONFIG_DIR: '/tmp/cursor-config/viby-session-1'
        });
        expect(harness.launches[0]?.cursorArgs).toEqual(['--foo']);
    });
});
