import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import type { EnhancedMode } from './loop';

const harness = vi.hoisted(() => ({
    notifications: [] as Array<{ method: string; params: unknown }>,
    registerRequestCalls: [] as string[],
    initializeCalls: [] as unknown[],
    startThreadCalls: [] as unknown[],
    resumeThreadCalls: [] as unknown[],
    startTurnCalls: [] as unknown[],
    delayFirstTurnCompletion: false,
    warmupNotifications: [] as Array<{ method: string; params: unknown }>,
    resumeThreadFailuresRemaining: 0,
    notificationHandler: null as ((method: string, params: unknown) => void) | null
}));

vi.mock('./codexAppServerClient', () => {
    class MockCodexAppServerClient {
        async connect(): Promise<void> {}

        async initialize(params: unknown): Promise<{ protocolVersion: number }> {
            harness.initializeCalls.push(params);
            return { protocolVersion: 1 };
        }

        setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
            harness.notificationHandler = handler;
        }

        registerRequestHandler(method: string): void {
            harness.registerRequestCalls.push(method);
        }

        async startThread(params: unknown): Promise<{ thread: { id: string }; model: string }> {
            harness.startThreadCalls.push(params);
            for (const notification of harness.warmupNotifications) {
                harness.notifications.push(notification);
                harness.notificationHandler?.(notification.method, notification.params);
            }
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async resumeThread(params: unknown): Promise<{ thread: { id: string }; model: string }> {
            harness.resumeThreadCalls.push(params);
            if (harness.resumeThreadFailuresRemaining > 0) {
                harness.resumeThreadFailuresRemaining -= 1;
                throw new Error('temporary resume failure');
            }
            return { thread: { id: 'thread-anonymous' }, model: 'gpt-5.4' };
        }

        async startTurn(params: unknown): Promise<{ turn: { id: string } }> {
            harness.startTurnCalls.push(params);
            const turnId = `turn-${harness.startTurnCalls.length}`;
            const started = { turn: { id: turnId } };
            harness.notifications.push({ method: 'turn/started', params: started });
            harness.notificationHandler?.('turn/started', started);

            if (!(harness.delayFirstTurnCompletion && harness.startTurnCalls.length === 1)) {
                const completed = { status: 'Completed', turn: { id: turnId } };
                harness.notifications.push({ method: 'turn/completed', params: completed });
                harness.notificationHandler?.('turn/completed', completed);
            }

            return { turn: { id: turnId } };
        }

        async interruptTurn(): Promise<Record<string, never>> {
            return {};
        }

        async disconnect(): Promise<void> {}
    }

    return { CodexAppServerClient: MockCodexAppServerClient };
});

import { codexRemoteLauncher } from './codexRemoteLauncher';

type FakeAgentState = {
    requests: Record<string, unknown>;
    completedRequests: Record<string, unknown>;
};

function createMode(): EnhancedMode {
    return {
        permissionMode: 'default',
        collaborationMode: 'default'
    };
}

function createSessionStub(modes: EnhancedMode[] = [createMode()]) {
    const queue = new MessageQueue2<EnhancedMode>((mode) => JSON.stringify(mode));
    for (const [index, mode] of modes.entries()) {
        queue.push(`hello from launcher test ${index + 1}`, mode);
    }
    queue.close();

    const sessionEvents: Array<{ type: string; [key: string]: unknown }> = [];
    const codexMessages: unknown[] = [];
    const streamUpdates: unknown[] = [];
    const thinkingChanges: boolean[] = [];
    const foundSessionIds: string[] = [];
    let currentModel: string | null | undefined;
    let currentModelReasoningEffort: EnhancedMode['modelReasoningEffort'];
    let agentState: FakeAgentState = {
        requests: {},
        completedRequests: {}
    };

    const rpcHandlers = new Map<string, (params: unknown) => unknown>();
    const client = {
        rpcHandlerManager: {
            registerHandler(method: string, handler: (params: unknown) => unknown) {
                rpcHandlers.set(method, handler);
            }
        },
        updateAgentState(handler: (state: FakeAgentState) => FakeAgentState) {
            agentState = handler(agentState);
        },
        sendCodexMessage(message: unknown) {
            codexMessages.push(message);
        },
        sendUserMessage(_text: string) {},
        sendStreamUpdate(update: unknown) {
            streamUpdates.push(update);
        },
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            sessionEvents.push(event);
        }
    };

    const session = {
        path: '/tmp/viby-update',
        logPath: '/tmp/viby-update/test.log',
        client,
        queue,
        codexArgs: undefined,
        codexCliOverrides: undefined,
        sessionId: null as string | null,
        startedBy: 'terminal' as 'runner' | 'terminal',
        thinking: false,
        getPermissionMode() {
            return 'default' as const;
        },
        setModel(nextModel: string | null) {
            currentModel = nextModel;
        },
        getModel() {
            return currentModel;
        },
        getCollaborationMode() {
            return 'default' as const;
        },
        getModelReasoningEffort() {
            return currentModelReasoningEffort;
        },
        onThinkingChange(nextThinking: boolean) {
            session.thinking = nextThinking;
            thinkingChanges.push(nextThinking);
        },
        onSessionFound(id: string) {
            session.sessionId = id;
            foundSessionIds.push(id);
        },
        sendCodexMessage(message: unknown) {
            client.sendCodexMessage(message);
        },
        sendSessionEvent(event: { type: string; [key: string]: unknown }) {
            client.sendSessionEvent(event);
        },
        sendStreamUpdate(update: unknown) {
            client.sendStreamUpdate(update);
        },
        sendUserMessage(text: string) {
            client.sendUserMessage(text);
        }
    };

    return {
        session,
        sessionEvents,
        codexMessages,
        streamUpdates,
        thinkingChanges,
        foundSessionIds,
        rpcHandlers,
        getModel: () => currentModel,
        getAgentState: () => agentState
    };
}

describe('codexRemoteLauncher', () => {
    afterEach(() => {
        harness.notifications = [];
        harness.registerRequestCalls = [];
        harness.initializeCalls = [];
        harness.startThreadCalls = [];
        harness.resumeThreadCalls = [];
        harness.startTurnCalls = [];
        harness.delayFirstTurnCompletion = false;
        harness.warmupNotifications = [];
        harness.resumeThreadFailuresRemaining = 0;
        harness.notificationHandler = null;
    });

    it('finishes a turn and emits ready when task lifecycle events omit turn_id', async () => {
        const {
            session,
            sessionEvents,
            thinkingChanges,
            foundSessionIds,
            getModel
        } = createSessionStub();

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toContain('thread-anonymous');
        expect(getModel()).toBe('gpt-5.4');
        expect(harness.initializeCalls).toEqual([{
            clientInfo: {
                name: 'viby-codex-client',
                version: '1.0.0'
            },
            capabilities: {
                experimentalApi: true
            }
        }]);
        expect(harness.startThreadCalls).toEqual([{
            cwd: '/tmp/viby-update',
            approvalPolicy: 'untrusted',
            sandbox: 'workspace-write'
        }]);
        expect(harness.notifications.map((entry) => entry.method)).toEqual(['turn/started', 'turn/completed']);
        expect(sessionEvents.filter((event) => event.type === 'ready').length).toBeGreaterThanOrEqual(1);
        expect(thinkingChanges).toContain(true);
        expect(session.thinking).toBe(false);
    });

    it('ignores warmup-only codex events before the first explicit user turn', async () => {
        harness.warmupNotifications = [
            {
                method: 'turn/started',
                params: { turn: { id: 'warmup-turn-1' } }
            },
            {
                method: 'thread/tokenUsage/updated',
                params: { tokenUsage: { total: 42 } }
            }
        ];

        const {
            session,
            codexMessages,
            thinkingChanges,
            foundSessionIds,
            sessionEvents
        } = createSessionStub([]);

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(foundSessionIds).toContain('thread-anonymous');
        expect(thinkingChanges).toEqual([]);
        expect(session.thinking).toBe(false);
        expect(codexMessages).toEqual([]);
        expect(sessionEvents).toEqual([]);
    });

    it('waits for the current turn to finish before starting another turn with a new model', async () => {
        harness.delayFirstTurnCompletion = true;

        const {
            session
        } = createSessionStub([
            createMode(),
            {
                permissionMode: 'default',
                collaborationMode: 'default',
                model: 'gpt-5.4'
            }
        ]);

        const launcherPromise = codexRemoteLauncher(session as never);

        await vi.waitFor(() => {
            expect(harness.startTurnCalls).toHaveLength(1);
        });

        const completed = { status: 'Completed', turn: { id: 'turn-1' } };
        harness.notifications.push({ method: 'turn/completed', params: completed });
        harness.notificationHandler?.('turn/completed', completed);

        await vi.waitFor(() => {
            expect(harness.startTurnCalls).toHaveLength(2);
        });

        expect(harness.startTurnCalls[1]).toMatchObject({
            collaborationMode: {
                settings: {
                    model: 'gpt-5.4'
                }
            }
        });

        const exitReason = await launcherPromise;
        expect(exitReason).toBe('exit');
    });

    it('forwards assistant text deltas over transient stream updates and clears on final message', async () => {
        harness.delayFirstTurnCompletion = true;

        const {
            session,
            codexMessages,
            streamUpdates
        } = createSessionStub();

        const launcherPromise = codexRemoteLauncher(session as never);

        await vi.waitFor(() => {
            expect(harness.startTurnCalls).toHaveLength(1);
        });

        harness.notificationHandler?.('item/agentMessage/delta', {
            itemId: 'msg-1',
            delta: 'Hello'
        });
        harness.notificationHandler?.('item/completed', {
            item: { id: 'msg-1', type: 'agentMessage' }
        });
        harness.notificationHandler?.('turn/completed', {
            status: 'Completed',
            turn: { id: 'turn-1' }
        });

        await launcherPromise;

        expect(streamUpdates).toContainEqual({
            kind: 'append',
            streamId: 'msg-1',
            delta: 'Hello'
        });
        expect(streamUpdates).toContainEqual({
            kind: 'clear'
        });
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'message',
            message: 'Hello',
            itemId: 'msg-1'
        }));
    });

    it('retries resume warmup during runner-managed startup until the old thread reattaches', async () => {
        harness.resumeThreadFailuresRemaining = 2;

        const {
            session,
            foundSessionIds
        } = createSessionStub();
        session.startedBy = 'runner';
        session.sessionId = 'thread-existing';

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.resumeThreadCalls).toHaveLength(3);
        expect(harness.startThreadCalls).toEqual([]);
        expect(foundSessionIds).toContain('thread-anonymous');
    });

    it('fails resume startup when the old thread never reattaches within the bounded retry budget', async () => {
        harness.resumeThreadFailuresRemaining = 3;

        const { session } = createSessionStub();
        session.startedBy = 'runner';
        session.sessionId = 'thread-existing';

        await expect(codexRemoteLauncher(session as never)).rejects.toThrow('temporary resume failure');
        expect(harness.resumeThreadCalls).toHaveLength(3);
        expect(harness.startThreadCalls).toEqual([]);
        expect(harness.startTurnCalls).toEqual([]);
    });

});
