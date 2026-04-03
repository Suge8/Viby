import React from 'react';
import { randomUUID } from 'node:crypto';

import type { CodexAppServerClient } from './codexAppServerClient';
import { CodexPermissionHandler } from './utils/permissionHandler';
import { ReasoningProcessor } from './utils/reasoningProcessor';
import { DiffProcessor } from './utils/diffProcessor';
import { logger } from '@/ui/logger';
import { CodexDisplay } from '@/ui/ink/CodexDisplay';
import { emitReadyIfIdle, flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle';
import type { CodexSession } from './session';
import type { EnhancedMode } from './loop';
import { hasCodexCliOverrides } from './utils/codexCliOverrides';
import { AppServerEventConverter } from './utils/appServerEventConverter';
import { registerAppServerPermissionHandlers } from './utils/appServerPermissionAdapter';
import { buildTurnStartParams } from './utils/appServerConfig';
import { shouldIgnoreTerminalEvent } from './utils/terminalEventGuard';
import { ensureCodexThreadStarted, getCodexThreadMode } from './utils/threadWarmup';
import {
    RemoteLauncherBase,
    type RemoteLauncherDisplayContext,
    type RemoteLauncherExitReason
} from '@/modules/common/remote/RemoteLauncherBase';

const TURN_CONTENT_EVENT_TYPES = new Set([
    'agent_message_delta',
    'agent_message',
    'agent_reasoning',
    'agent_reasoning_delta',
    'agent_reasoning_section_break',
    'exec_command_begin',
    'exec_command_end'
]);

const TERMINAL_EVENT_TYPES = new Set([
    'task_complete',
    'turn_aborted',
    'task_failed'
]);

const ABORT_SUPPRESSED_NOTIFICATION_METHODS = new Set([
    'turn/diff/updated',
    'codex/event/item_started',
    'codex/event/item_completed',
    'codex/event/agent_message_delta',
    'codex/event/agent_message_content_delta',
    'codex/event/reasoning_content_delta',
    'codex/event/agent_reasoning_section_break',
    'codex/event/agent_reasoning_delta',
    'codex/event/agent_reasoning',
    'codex/event/agent_message',
    'codex/event/exec_command_output_delta'
]);
const RUNNER_RESUME_WARMUP_MAX_ATTEMPTS = 3;
const RUNNER_RESUME_WARMUP_RETRY_BASE_DELAY_MS = 250;

function isAbortSuppressedNotificationMethod(method: string): boolean {
    if (method.startsWith('item/')) {
        return true;
    }

    return ABORT_SUPPRESSED_NOTIFICATION_METHODS.has(method);
}

function hasExplicitTurnContext(options: {
    turnInFlight: boolean;
    currentTurnId: string | null;
}): boolean {
    return options.turnInFlight || options.currentTurnId !== null;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiresSynchronousResumeWarmup(session: CodexSession): boolean {
    return session.startedBy === 'runner' && typeof session.sessionId === 'string';
}

function getResumeWarmupRetryDelayMs(attempt: number): number {
    return attempt * RUNNER_RESUME_WARMUP_RETRY_BASE_DELAY_MS;
}

function shouldRetryResumeWarmup(options: {
    requiresResumeWarmup: boolean;
    attempt: number;
    maxAttempts: number;
}): boolean {
    return options.requiresResumeWarmup && options.attempt < options.maxAttempts;
}

type QueuedMessage = { message: string; mode: EnhancedMode; isolate: boolean; hash: string };

class CodexRemoteLauncher extends RemoteLauncherBase {
    private static readonly MAX_ABORTED_TURN_IDS = 8;
    private readonly session: CodexSession;
    private readonly appServerClient: CodexAppServerClient;
    private permissionHandler: CodexPermissionHandler | null = null;
    private reasoningProcessor: ReasoningProcessor | null = null;
    private diffProcessor: DiffProcessor | null = null;
    private abortController: AbortController = new AbortController();
    private currentThreadId: string | null = null;
    private currentTurnId: string | null = null;
    private suppressedTurnIds: string[] = [];
    private suppressAnonymousTurnEvents = false;

    constructor(session: CodexSession) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
        this.appServerClient = session.getAppServerClient();
    }

    protected createDisplay(context: RemoteLauncherDisplayContext): React.ReactElement {
        return React.createElement(CodexDisplay, context);
    }

    private rememberSuppressedTurn(turnId: string): void {
        this.suppressedTurnIds = this.suppressedTurnIds.filter((entry) => entry !== turnId);
        this.suppressedTurnIds.push(turnId);
        if (this.suppressedTurnIds.length > CodexRemoteLauncher.MAX_ABORTED_TURN_IDS) {
            this.suppressedTurnIds.shift();
        }
    }

    private shouldIgnoreTurnContentEvent(msgType: string, eventTurnId: string | null): boolean {
        if (!TURN_CONTENT_EVENT_TYPES.has(msgType)) {
            return false;
        }

        if (this.suppressAnonymousTurnEvents) {
            if (!eventTurnId) {
                logger.debug(`[Codex] Ignoring anonymous ${msgType} while abort suppression is active`);
                return true;
            }

            if (!this.currentTurnId || eventTurnId === this.currentTurnId) {
                logger.debug(`[Codex] Ignoring ${msgType} for in-flight aborted turn ${eventTurnId}`);
                return true;
            }
        }

        if (eventTurnId && this.suppressedTurnIds.includes(eventTurnId)) {
            logger.debug(`[Codex] Ignoring ${msgType} for suppressed turn ${eventTurnId}`);
            return true;
        }

        if (eventTurnId && this.currentTurnId && eventTurnId !== this.currentTurnId) {
            logger.debug(
                `[Codex] Ignoring ${msgType} for non-current turn ${eventTurnId}; active=${this.currentTurnId}`
            );
            return true;
        }

        return false;
    }

    private async handleAbort(): Promise<void> {
        logger.debug('[Codex] Abort requested - stopping current task');
        try {
            if (this.currentTurnId) {
                this.rememberSuppressedTurn(this.currentTurnId);
            }
            this.suppressAnonymousTurnEvents = true;
            if (this.currentThreadId && this.currentTurnId) {
                try {
                    await this.appServerClient.interruptTurn({
                        threadId: this.currentThreadId,
                        turnId: this.currentTurnId
                    });
                } catch (error) {
                    logger.debug('[Codex] Error interrupting app-server turn:', error);
                }
            }
            this.currentTurnId = null;

            this.abortController.abort();
            this.session.queue.reset();
            this.session.sendStreamUpdate({ kind: 'clear' });
            this.session.onThinkingChange(false);
            this.permissionHandler?.reset();
            this.reasoningProcessor?.abort();
            this.diffProcessor?.reset();
            logger.debug('[Codex] Abort completed - session remains active');
        } catch (error) {
            logger.debug('[Codex] Error during abort:', error);
        } finally {
            this.abortController = new AbortController();
        }
    }

    private async handleExitFromUi(): Promise<void> {
        logger.debug('[codex-remote]: Exiting agent via Ctrl-C');
        this.exitReason = 'exit';
        this.shouldExit = true;
        await this.handleAbort();
    }

    private async handleSwitchFromUi(): Promise<void> {
        logger.debug('[codex-remote]: Switching to local mode via double space');
        this.exitReason = 'switch';
        this.shouldExit = true;
        await this.handleAbort();
    }

    private async handleSwitchRequest(): Promise<void> {
        this.exitReason = 'switch';
        this.shouldExit = true;
        await this.handleAbort();
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        if (this.session.codexArgs && this.session.codexArgs.length > 0) {
            if (hasCodexCliOverrides(this.session.codexCliOverrides)) {
                logger.debug(`[codex-remote] CLI args include sandbox/approval overrides; other args ` +
                    `are ignored in remote mode.`);
            } else {
                logger.debug(`[codex-remote] Warning: CLI args [${this.session.codexArgs.join(', ')}] are ignored in remote mode. ` +
                    `Remote mode uses message-based configuration (model/sandbox set via web interface).`);
            }
        }

        return this.start({
            onExit: () => this.handleExitFromUi(),
            onSwitchToLocal: () => this.handleSwitchFromUi()
        });
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session;
        const messageBuffer = this.messageBuffer;
        const appServerClient = this.appServerClient;
        const appServerEventConverter = new AppServerEventConverter();
        let hasThread = false;

        const normalizeCommand = (value: unknown): string | undefined => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed.length > 0 ? trimmed : undefined;
            }
            if (Array.isArray(value)) {
                const joined = value.filter((part): part is string => typeof part === 'string').join(' ');
                return joined.length > 0 ? joined : undefined;
            }
            return undefined;
        };

        const asRecord = (value: unknown): Record<string, unknown> | null => {
            if (!value || typeof value !== 'object') {
                return null;
            }
            return value as Record<string, unknown>;
        };

        const asString = (value: unknown): string | null => {
            return typeof value === 'string' && value.length > 0 ? value : null;
        };

        const applyResolvedModel = (value: unknown): string | undefined => {
            const resolvedModel = asString(value) ?? undefined;
            if (!resolvedModel) {
                return undefined;
            }
            session.setModel(resolvedModel);
            logger.debug(`[Codex] Resolved app-server model: ${resolvedModel}`);
            return resolvedModel;
        };

        const bindThreadId = (threadId: string): void => {
            this.currentThreadId = threadId;
            session.onSessionFound(threadId);
        };

        const ensureThreadReady = async (mode: EnhancedMode, options?: { logIfMissing?: boolean }): Promise<string> => {
            if (this.currentThreadId && hasThread) {
                return this.currentThreadId;
            }

            if (!this.currentThreadId && options?.logIfMissing) {
                logger.debug('[Codex] Missing thread id; restarting app-server thread');
            }

            const threadId = await ensureCodexThreadStarted({
                session,
                appServerClient,
                mode,
                abortSignal: this.abortController.signal,
                onModelResolved: applyResolvedModel
            });
            bindThreadId(threadId);
            hasThread = true;
            return threadId;
        };

        const buildMcpToolName = (server: unknown, tool: unknown): string | null => {
            const serverName = asString(server);
            const toolName = asString(tool);
            if (!serverName || !toolName) {
                return null;
            }
            return `mcp__${serverName}__${toolName}`;
        };

        const clearAssistantStream = (streamId?: string): void => {
            session.sendStreamUpdate(
                streamId
                    ? { kind: 'clear', streamId }
                    : { kind: 'clear' }
            );
        };

        const appendAssistantStream = (streamId: string, delta: string): void => {
            session.sendStreamUpdate({
                kind: 'append',
                streamId,
                delta
            });
        };

        const formatOutputPreview = (value: unknown): string => {
            if (typeof value === 'string') return value;
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            if (value === null || value === undefined) return '';
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        };

        const permissionHandler = new CodexPermissionHandler(session.client, () => {
            const mode = session.getPermissionMode();
            return mode === 'default' || mode === 'read-only' || mode === 'safe-yolo' || mode === 'yolo'
                ? mode
                : undefined;
        }, {
            onRequest: ({ id, toolName, input }) => {
                const inputRecord = asRecord(input) ?? {};
                const message = typeof inputRecord.message === 'string' ? inputRecord.message : undefined;
                const command = normalizeCommand(inputRecord.command);
                const cwdValue = inputRecord.cwd;
                const cwd = typeof cwdValue === 'string' && cwdValue.trim().length > 0 ? cwdValue : undefined;

                session.sendCodexMessage({
                    type: 'tool-call',
                    name: 'CodexPermission',
                    callId: id,
                    input: {
                        tool: toolName,
                        message,
                        command,
                        cwd
                    },
                    id: randomUUID()
                });
            },
            onComplete: ({ id, decision, reason, approved }) => {
                session.sendCodexMessage({
                    type: 'tool-call-result',
                    callId: id,
                    output: {
                        decision,
                        reason
                    },
                    is_error: !approved,
                    id: randomUUID()
                });
            }
        });
        const reasoningProcessor = new ReasoningProcessor((message) => {
            session.sendCodexMessage(message);
        });
        const diffProcessor = new DiffProcessor((message) => {
            session.sendCodexMessage(message);
        });
        this.permissionHandler = permissionHandler;
        this.reasoningProcessor = reasoningProcessor;
        this.diffProcessor = diffProcessor;
        let readyAfterTurnTimer: ReturnType<typeof setTimeout> | null = null;
        let scheduleReadyAfterTurn: (() => void) | null = null;
        let clearReadyAfterTurnTimer: (() => void) | null = null;
        let turnInFlight = false;
        let allowAnonymousTerminalEvent = false;
        let resolveTurnSettledWaiter: (() => void) | null = null;

        const notifyTurnSettled = () => {
            const waiter = resolveTurnSettledWaiter;
            resolveTurnSettledWaiter = null;
            waiter?.();
        };

        const waitForTurnToSettle = async () => {
            if (!turnInFlight) {
                return;
            }

            await new Promise<void>((resolve) => {
                if (!turnInFlight) {
                    resolve();
                    return;
                }

                resolveTurnSettledWaiter = resolve;
            });
        };

        const handleCodexEvent = (msg: Record<string, unknown>) => {
            const msgType = asString(msg.type);
            if (!msgType) return;
            const eventTurnId = asString(msg.turn_id ?? msg.turnId);
            const isTerminalEvent = TERMINAL_EVENT_TYPES.has(msgType);

            if (this.shouldIgnoreTurnContentEvent(msgType, eventTurnId)) {
                return;
            }

            if (msgType === 'thread_started') {
                const threadId = asString(msg.thread_id ?? msg.threadId);
                if (threadId) {
                    bindThreadId(threadId);
                }
                return;
            }

            if (!hasExplicitTurnContext({
                turnInFlight,
                currentTurnId: this.currentTurnId
            })) {
                logger.debug(`[Codex] Ignoring ${msgType} outside an explicit user turn`);
                return;
            }

            if (msgType === 'task_started') {
                const turnId = eventTurnId;
                if (turnId) {
                    if (this.suppressAnonymousTurnEvents) {
                        this.rememberSuppressedTurn(turnId);
                    }
                    this.currentTurnId = turnId;
                    allowAnonymousTerminalEvent = false;
                } else if (!this.currentTurnId) {
                    allowAnonymousTerminalEvent = true;
                }
            }

            if (isTerminalEvent) {
                if (shouldIgnoreTerminalEvent({
                    eventTurnId,
                    currentTurnId: this.currentTurnId,
                    turnInFlight,
                    allowAnonymousTerminalEvent
                })) {
                    logger.debug(
                        `[Codex] Ignoring terminal event ${msgType} without matching turn context; ` +
                        `eventTurnId=${eventTurnId ?? 'none'}, activeTurn=${this.currentTurnId ?? 'none'}, ` +
                        `turnInFlight=${turnInFlight}, allowAnonymous=${allowAnonymousTerminalEvent}`
                    );
                    return;
                }
                this.currentTurnId = null;
                allowAnonymousTerminalEvent = false;
            }

            if (isTerminalEvent) {
                clearAssistantStream();
            }

            if (msgType === 'agent_message') {
                const message = asString(msg.message);
                if (message) {
                    messageBuffer.addMessage(message, 'assistant');
                }
            } else if (msgType === 'agent_reasoning') {
                const text = asString(msg.text);
                if (text) {
                    messageBuffer.addMessage(`[Thinking] ${text.substring(0, 100)}...`, 'system');
                }
            } else if (msgType === 'exec_command_begin') {
                const command = normalizeCommand(msg.command) ?? 'command';
                messageBuffer.addMessage(`Executing: ${command}`, 'tool');
            } else if (msgType === 'exec_command_end') {
                const output = msg.output ?? msg.error ?? 'Command completed';
                const outputText = formatOutputPreview(output);
                const truncatedOutput = outputText.substring(0, 200);
                messageBuffer.addMessage(
                    `Result: ${truncatedOutput}${outputText.length > 200 ? '...' : ''}`,
                    'result'
                );
            } else if (msgType === 'task_started') {
                messageBuffer.addMessage('Starting task...', 'status');
            } else if (msgType === 'task_complete') {
                messageBuffer.addMessage('Task completed', 'status');
            } else if (msgType === 'turn_aborted') {
                messageBuffer.addMessage('Turn aborted', 'status');
            } else if (msgType === 'task_failed') {
                const error = asString(msg.error);
                messageBuffer.addMessage(error ? `Task failed: ${error}` : 'Task failed', 'status');
            }

            if (msgType === 'task_started') {
                clearReadyAfterTurnTimer?.();
                turnInFlight = true;
                if (!eventTurnId && !this.currentTurnId) {
                    allowAnonymousTerminalEvent = true;
                }
                if (!session.thinking) {
                    logger.debug('thinking started');
                    session.onThinkingChange(true);
                }
            }
            if (isTerminalEvent) {
                turnInFlight = false;
                allowAnonymousTerminalEvent = false;
                notifyTurnSettled();
                if (session.thinking) {
                    logger.debug('thinking completed');
                    session.onThinkingChange(false);
                }
                diffProcessor.reset();
                appServerEventConverter.reset();
            }

            if (isTerminalEvent && !turnInFlight) {
                scheduleReadyAfterTurn?.();
            } else if (readyAfterTurnTimer && msgType !== 'task_started') {
                scheduleReadyAfterTurn?.();
            }

            if (msgType === 'agent_reasoning_section_break') {
                reasoningProcessor.handleSectionBreak();
            }
            if (msgType === 'agent_message_delta') {
                const streamId = asString(msg.item_id ?? msg.itemId);
                const delta = asString(msg.delta);
                if (streamId && delta) {
                    appendAssistantStream(streamId, delta);
                }
            }
            if (msgType === 'agent_reasoning_delta') {
                const delta = asString(msg.delta);
                if (delta) {
                    reasoningProcessor.processDelta(delta);
                }
            }
            if (msgType === 'agent_reasoning') {
                const text = asString(msg.text);
                if (text) {
                    reasoningProcessor.complete(text);
                }
            }
            if (msgType === 'agent_message') {
                const message = asString(msg.message);
                const streamId = asString(msg.item_id ?? msg.itemId);
                if (message) {
                    session.sendCodexMessage({
                        type: 'message',
                        message,
                        ...(streamId ? { itemId: streamId } : {}),
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'exec_command_begin' || msgType === 'exec_approval_request') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const inputs: Record<string, unknown> = { ...msg };
                    delete inputs.type;
                    delete inputs.call_id;
                    delete inputs.callId;

                    session.sendCodexMessage({
                        type: 'tool-call',
                        name: 'CodexBash',
                        callId: callId,
                        input: inputs,
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'exec_command_end') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const output: Record<string, unknown> = { ...msg };
                    delete output.type;
                    delete output.call_id;
                    delete output.callId;

                    session.sendCodexMessage({
                        type: 'tool-call-result',
                        callId: callId,
                        output,
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'token_count') {
                session.sendCodexMessage({
                    ...msg,
                    id: randomUUID()
                });
            }
            if (msgType === 'patch_apply_begin') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const changes = asRecord(msg.changes) ?? {};
                    const changeCount = Object.keys(changes).length;
                    const filesMsg = changeCount === 1 ? '1 file' : `${changeCount} files`;
                    messageBuffer.addMessage(`Modifying ${filesMsg}...`, 'tool');

                    session.sendCodexMessage({
                        type: 'tool-call',
                        name: 'CodexPatch',
                        callId: callId,
                        input: {
                            auto_approved: msg.auto_approved ?? msg.autoApproved,
                            changes
                        },
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'patch_apply_end') {
                const callId = asString(msg.call_id ?? msg.callId);
                if (callId) {
                    const stdout = asString(msg.stdout);
                    const stderr = asString(msg.stderr);
                    const success = Boolean(msg.success);

                    if (success) {
                        const message = stdout || 'Files modified successfully';
                        messageBuffer.addMessage(message.substring(0, 200), 'result');
                    } else {
                        const errorMsg = stderr || 'Failed to modify files';
                        messageBuffer.addMessage(`Error: ${errorMsg.substring(0, 200)}`, 'result');
                    }

                    session.sendCodexMessage({
                        type: 'tool-call-result',
                        callId: callId,
                        output: {
                            stdout,
                            stderr,
                            success
                        },
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'mcp_tool_call_begin') {
                const callId = asString(msg.call_id ?? msg.callId);
                const invocation = asRecord(msg.invocation) ?? {};
                const name = buildMcpToolName(
                    invocation.server ?? invocation.server_name ?? msg.server,
                    invocation.tool ?? invocation.tool_name ?? msg.tool
                );
                if (callId && name) {
                    session.sendCodexMessage({
                        type: 'tool-call',
                        name,
                        callId,
                        input: invocation.arguments ?? invocation.input ?? msg.arguments ?? msg.input ?? {},
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'mcp_tool_call_end') {
                const callId = asString(msg.call_id ?? msg.callId);
                const rawResult = msg.result;
                let output = rawResult;
                let isError = false;
                const resultRecord = asRecord(rawResult);
                if (resultRecord) {
                    if (Object.prototype.hasOwnProperty.call(resultRecord, 'Ok')) {
                        output = resultRecord.Ok;
                    } else if (Object.prototype.hasOwnProperty.call(resultRecord, 'Err')) {
                        output = resultRecord.Err;
                        isError = true;
                    }
                }

                if (callId) {
                    session.sendCodexMessage({
                        type: 'tool-call-result',
                        callId,
                        output,
                        is_error: isError,
                        id: randomUUID()
                    });
                }
            }
            if (msgType === 'turn_diff') {
                const diff = asString(msg.unified_diff);
                if (diff) {
                    diffProcessor.processDiff(diff);
                }
            }
        };

        registerAppServerPermissionHandlers({
            client: appServerClient,
            permissionHandler
        });

        appServerClient.setNotificationHandler((method, params) => {
            const shouldSuppressDuringAbort = this.suppressAnonymousTurnEvents
                && isAbortSuppressedNotificationMethod(method);

            if (shouldSuppressDuringAbort) {
                logger.debug(`[Codex] Suppressing raw notification during abort: ${method}`);
                return;
            }

            const events = appServerEventConverter.handleNotification(method, params);
            for (const event of events) {
                const eventRecord = asRecord(event) ?? { type: undefined };
                handleCodexEvent(eventRecord);
            }
        });

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
            onSwitch: () => this.handleSwitchRequest()
        });

        function logActiveHandles(tag: string) {
            if (!process.env.DEBUG) return;
            const anyProc: any = process as any;
            const handles = typeof anyProc._getActiveHandles === 'function' ? anyProc._getActiveHandles() : [];
            const requests = typeof anyProc._getActiveRequests === 'function' ? anyProc._getActiveRequests() : [];
            logger.debug(`[codex][handles] ${tag}: handles=${handles.length} requests=${requests.length}`);
            try {
                const kinds = handles.map((h: any) => (h && h.constructor ? h.constructor.name : typeof h));
                logger.debug(`[codex][handles] kinds=${JSON.stringify(kinds)}`);
            } catch {}
        }

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' });
        };

        await appServerClient.connect();
        await appServerClient.initialize({
            clientInfo: {
                name: 'viby-codex-client',
                version: '1.0.0'
            },
            capabilities: {
                experimentalApi: true
            }
        });

        let pending: QueuedMessage | null = null;
        const requiresResumeWarmup = requiresSynchronousResumeWarmup(session);
        const initialWarmupAttemptLimit = requiresResumeWarmup ? RUNNER_RESUME_WARMUP_MAX_ATTEMPTS : 1;
        let initialWarmupError: unknown = null;

        for (let attempt = 1; attempt <= initialWarmupAttemptLimit; attempt += 1) {
            try {
                this.currentThreadId = await ensureThreadReady(getCodexThreadMode(session), {
                    logIfMissing: attempt > 1
                });
                initialWarmupError = null;
                break;
            } catch (error) {
                initialWarmupError = error;
                this.currentThreadId = null;
                hasThread = false;

                if (!requiresResumeWarmup) {
                    logger.warn('[Codex] Initial remote warmup failed; will retry on first turn', error);
                    break;
                }

                if (shouldRetryResumeWarmup({
                    requiresResumeWarmup,
                    attempt,
                    maxAttempts: initialWarmupAttemptLimit
                })) {
                    logger.warn(`[Codex] Resume warmup attempt ${attempt}/${initialWarmupAttemptLimit} failed; retrying`, error);
                    await delay(getResumeWarmupRetryDelayMs(attempt));
                    continue;
                }
            }
        }

        if (requiresResumeWarmup && initialWarmupError) {
            throw initialWarmupError;
        }

        clearReadyAfterTurnTimer = () => {
            if (!readyAfterTurnTimer) {
                return;
            }
            clearTimeout(readyAfterTurnTimer);
            readyAfterTurnTimer = null;
        };

        scheduleReadyAfterTurn = () => {
            clearReadyAfterTurnTimer?.();
            readyAfterTurnTimer = setTimeout(() => {
                readyAfterTurnTimer = null;
                void emitReadyIfIdle({
                    hasPending: () => pending !== null,
                    queueSize: () => session.queue.size(),
                    shouldExit: () => this.shouldExit,
                    flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
                    sendReady
                });
            }, 120);
            readyAfterTurnTimer.unref?.();
        };

        while (!this.shouldExit) {
            logActiveHandles('loop-top');
            let message: QueuedMessage | null = pending;
            pending = null;
            if (!message) {
                const waitSignal = this.abortController.signal;
                const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal);
                if (!batch) {
                    if (waitSignal.aborted && !this.shouldExit) {
                        logger.debug('[codex]: Wait aborted while idle; ignoring and continuing');
                        continue;
                    }
                    logger.debug(`[codex]: batch=${!!batch}, shouldExit=${this.shouldExit}`);
                    break;
                }
                message = batch;
            }

            if (!message) {
                break;
            }

            if (turnInFlight) {
                pending = message;
                await waitForTurnToSettle();
                continue;
            }

            messageBuffer.addMessage(message.message, 'user');

            try {
                this.suppressAnonymousTurnEvents = false;
                this.currentThreadId = await ensureThreadReady(getCodexThreadMode(session, message.mode), {
                    logIfMissing: !this.currentThreadId
                });

                const turnMode = {
                    ...message.mode,
                    model: session.getModel() ?? message.mode.model,
                    modelReasoningEffort: session.getModelReasoningEffort() ?? message.mode.modelReasoningEffort
                };
                if (turnMode.developerInstructions) {
                    logger.debug('[Codex] Starting turn with developer instructions');
                }
                const turnParams = buildTurnStartParams({
                    threadId: this.currentThreadId,
                    message: message.message,
                    cwd: session.path,
                    mode: turnMode,
                    cliOverrides: session.codexCliOverrides,
                    developerInstructions: turnMode.developerInstructions
                });
                turnInFlight = true;
                allowAnonymousTerminalEvent = false;
                const turnResponse = await appServerClient.startTurn(turnParams, {
                    signal: this.abortController.signal
                });
                const turnRecord = asRecord(turnResponse);
                const turn = turnRecord ? asRecord(turnRecord.turn) : null;
                const turnId = asString(turn?.id);
                if (turnId) {
                    if (this.suppressAnonymousTurnEvents) {
                        this.rememberSuppressedTurn(turnId);
                    }
                    this.currentTurnId = turnId;
                } else if (!this.currentTurnId) {
                    allowAnonymousTerminalEvent = true;
                }
            } catch (error) {
                logger.warn('Error in codex session:', error);
                const isAbortError = error instanceof Error && error.name === 'AbortError';
                turnInFlight = false;
                allowAnonymousTerminalEvent = false;
                this.currentTurnId = null;
                clearAssistantStream();
                notifyTurnSettled();

                if (isAbortError) {
                    messageBuffer.addMessage('Aborted by user', 'status');
                    session.sendSessionEvent({ type: 'message', message: 'Aborted by user' });
                } else {
                    messageBuffer.addMessage('Process exited unexpectedly', 'status');
                    session.sendSessionEvent({ type: 'message', message: 'Process exited unexpectedly' });
                    this.currentTurnId = null;
                    this.currentThreadId = null;
                    hasThread = false;
                }
            } finally {
                if (!turnInFlight) {
                    clearAssistantStream();
                    permissionHandler.reset();
                    reasoningProcessor.abort();
                    diffProcessor.reset();
                    appServerEventConverter.reset();
                    session.onThinkingChange(false);
                    clearReadyAfterTurnTimer?.();
                    await emitReadyIfIdle({
                        hasPending: () => pending !== null,
                        queueSize: () => session.queue.size(),
                        shouldExit: () => this.shouldExit,
                        flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
                        sendReady
                    });
                }
                logActiveHandles('after-turn');
            }
        }
    }

    protected async cleanup(): Promise<void> {
        logger.debug('[codex-remote]: cleanup start');
        this.appServerClient.setNotificationHandler(null);

        this.clearAbortHandlers(this.session.client.rpcHandlerManager);

        this.permissionHandler?.reset();
        this.reasoningProcessor?.abort();
        this.diffProcessor?.reset();
        this.permissionHandler = null;
        this.reasoningProcessor = null;
        this.diffProcessor = null;

        logger.debug('[codex-remote]: cleanup done');
    }
}

export async function codexRemoteLauncher(session: CodexSession): Promise<'switch' | 'exit'> {
    const launcher = new CodexRemoteLauncher(session);
    return launcher.launch();
}
