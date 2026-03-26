import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
    bootstrapArgs: [] as Array<Record<string, unknown>>,
    sessionState: {
        permissionMode: 'default' as string,
        model: null as string | null,
    },
    onUserMessage: null as null | ((message: { content: { text: string; attachments: unknown[] } }) => void),
    rpcHandlers: new Map<string, (payload: unknown) => Promise<unknown>>(),
    queueModes: [] as Array<Record<string, unknown>>,
    geminiLoopArgs: [] as Array<Record<string, unknown>>,
    session: {
        onUserMessage(callback: (message: { content: { text: string; attachments: unknown[] } }) => void) {
            harness.onUserMessage = callback;
        },
        rpcHandlerManager: {
            registerHandler(name: string, handler: (payload: unknown) => Promise<unknown>) {
                harness.rpcHandlers.set(name, handler);
            }
        }
    }
}));

vi.mock('@/agent/sessionFactory', () => ({
    bootstrapSession: vi.fn(async (options: Record<string, unknown>) => {
        harness.bootstrapArgs.push(options);
        return {
            api: {},
            session: harness.session
        };
    })
}));

vi.mock('./loop', () => ({
    geminiLoop: vi.fn(async (options: {
        messageQueue: {
            queue: Array<{ mode: Record<string, unknown> }>
        }
        onSessionReady?: (session: {
            setPermissionMode(mode: string): void
            setModel(model: string | null): void
        }) => void
    } & Record<string, unknown>) => {
        harness.geminiLoopArgs.push(options);

        const sessionInstance = {
            stopKeepAlive() {},
            setPermissionMode(mode: string) {
                harness.sessionState.permissionMode = mode;
            },
            setModel(model: string | null) {
                harness.sessionState.model = model;
            }
        };

        options.onSessionReady?.(sessionInstance);

        const applyConfig = harness.rpcHandlers.get('set-session-config');
        if (!applyConfig || !harness.onUserMessage) {
            return;
        }

        const result = await applyConfig({
            model: 'gemini-2.5-flash-lite'
        });

        expect(result).toEqual({
            applied: {
                permissionMode: 'default',
                model: 'gemini-2.5-flash-lite'
            }
        });

        harness.onUserMessage({
            content: {
                text: 'ping',
                attachments: []
            }
        });

        harness.queueModes = options.messageQueue.queue.map((entry) => entry.mode);
    })
}));

vi.mock('@/claude/registerKillSessionHandler', () => ({
    registerKillSessionHandler: vi.fn()
}));

vi.mock('@/agent/runnerLifecycle', () => ({
    createModeChangeHandler: vi.fn(() => vi.fn()),
    createRunnerLifecycle: vi.fn(() => ({
        registerProcessHandlers: vi.fn(),
        cleanupAndExit: vi.fn(async () => {}),
        markCrash: vi.fn(),
        setExitCode: vi.fn()
    })),
    setControlledByUser: vi.fn()
}));

vi.mock('@/claude/utils/startHookServer', () => ({
    startHookServer: vi.fn(async () => ({
        port: 1234,
        token: 'token',
        stop: vi.fn()
    }))
}));

vi.mock('@/modules/common/hooks/generateHookSettings', () => ({
    cleanupHookSettingsFile: vi.fn(),
    generateHookSettingsFile: vi.fn(() => '/tmp/gemini-hooks.json')
}));

const resolveGeminiRuntimeConfigMock = vi.hoisted(() => vi.fn());

vi.mock('./utils/config', () => ({
    resolveGeminiRuntimeConfig: resolveGeminiRuntimeConfigMock
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}));

vi.mock('@/utils/attachmentFormatter', () => ({
    formatMessageWithAttachments: vi.fn((text: string) => text)
}));

import { runGemini } from './runGemini';

describe('runGemini live session config', () => {
    beforeEach(() => {
        harness.bootstrapArgs.length = 0;
        harness.geminiLoopArgs.length = 0;
        harness.queueModes = [];
        harness.onUserMessage = null;
        harness.rpcHandlers.clear();
        harness.sessionState.permissionMode = 'default';
        harness.sessionState.model = null;
        resolveGeminiRuntimeConfigMock.mockReset();
    });

    it('persists a resolved local or explicit model before bootstrapping the session', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-3-pro-preview',
            modelSource: 'local'
        });

        await runGemini({});

        expect(harness.bootstrapArgs[0]?.model).toBe('gemini-3-pro-preview');
        expect(harness.geminiLoopArgs[0]?.model).toBe('gemini-3-pro-preview');
    });

    it('keeps terminal default semantics when Gemini runtime config has no explicit model', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: undefined,
            modelSource: 'terminal-default'
        });

        await runGemini({});

        expect(harness.bootstrapArgs[0]?.model).toBeUndefined();
        expect(harness.geminiLoopArgs[0]?.model).toBeUndefined();
    });

    it('forwards resumeSessionId into the Gemini loop', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: 'gemini-2.5-pro',
            modelSource: 'explicit'
        });

        await runGemini({ resumeSessionId: 'gemini-session-123' });

        expect(harness.geminiLoopArgs[0]?.resumeSessionId).toBe('gemini-session-123');
    });

    it('applies live model updates to the next queued user message', async () => {
        resolveGeminiRuntimeConfigMock.mockReturnValue({
            model: undefined,
            modelSource: 'terminal-default'
        });

        await runGemini({ startedBy: 'runner' });

        expect(harness.sessionState.model).toBe('gemini-2.5-flash-lite');
        expect(harness.queueModes).toEqual([
            {
                permissionMode: 'default',
                model: 'gemini-2.5-flash-lite'
            }
        ]);
    });
});
