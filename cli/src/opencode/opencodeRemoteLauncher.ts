import React from 'react';
import { logger } from '@/ui/logger';
import { forwardAcpAgentMessage, toAcpMcpServers } from '@/agent/acpAgentInterop';
import { emitReadyIfIdle, flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle';
import type { AgentMessage, PromptContent } from '@/agent/types';
import { RemoteLauncherBase, type RemoteLauncherDisplayContext, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase';
import { OpencodeDisplay } from '@/ui/ink/OpencodeDisplay';
import type { OpencodeSession } from './session';
import type { PermissionMode } from './types';
import { OpencodePermissionHandler } from './utils/permissionHandler';
import { TITLE_INSTRUCTION } from './utils/systemPrompt';
import {
    mergePromptSegments,
    prependPromptInstructionsToMessage,
    resolveTeamRolePromptContract
} from '@/agent/teamPromptContract';

class OpencodeRemoteLauncher extends RemoteLauncherBase {
    private readonly session: OpencodeSession;
    private permissionHandler: OpencodePermissionHandler | null = null;
    private abortController = new AbortController();
    private displayPermissionMode: PermissionMode | null = null;
    private appliedSessionInstructions: string | null = null;

    constructor(session: OpencodeSession) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        return this.start({
            onExit: () => this.handleExitFromUi(),
            onSwitchToLocal: () => this.handleSwitchFromUi()
        });
    }

    protected createDisplay(context: RemoteLauncherDisplayContext): React.ReactElement {
        return React.createElement(OpencodeDisplay, context);
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session;
        const messageBuffer = this.messageBuffer;

        const { mcpServers } = await session.ensureRemoteBridge();
        const backend = session.ensureRemoteBackend();

        backend.onStderrError((error) => {
            logger.debug('[opencode-remote] stderr error', error);
            session.sendSessionEvent({ type: 'message', message: error.message });
            messageBuffer.addMessage(error.message, 'status');
        });

        await backend.initialize();

        const resumeSessionId = session.sessionId;
        const mcpServerList = toAcpMcpServers(mcpServers);
        let acpSessionId: string;
        if (resumeSessionId) {
            try {
                acpSessionId = await backend.loadSession({
                    sessionId: resumeSessionId,
                    cwd: session.path,
                    mcpServers: mcpServerList
                });
            } catch (error) {
                logger.warn('[opencode-remote] resume failed, starting new session', error);
                session.sendSessionEvent({
                    type: 'message',
                    message: 'OpenCode resume failed; starting a new session.'
                });
                acpSessionId = await backend.newSession({
                    cwd: session.path,
                    mcpServers: mcpServerList
                });
            }
        } else {
            acpSessionId = await backend.newSession({
                cwd: session.path,
                mcpServers: mcpServerList
            });
        }
        session.onSessionFound(acpSessionId);

        this.permissionHandler = new OpencodePermissionHandler(
            session.client,
            backend,
            () => session.getPermissionMode() as PermissionMode | undefined
        );
        this.applyDisplayMode(session.getPermissionMode() as PermissionMode);

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
            onSwitch: () => this.handleSwitchRequest()
        });

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' });
        };

        const preparePromptText = (message: string): string => {
            const sessionInstructions = mergePromptSegments(
                TITLE_INSTRUCTION,
                resolveTeamRolePromptContract(session.client.getTeamContextSnapshot())
            )
            if (!sessionInstructions) {
                return message
            }
            if (this.appliedSessionInstructions === sessionInstructions) {
                return message
            }
            this.appliedSessionInstructions = sessionInstructions
            return prependPromptInstructionsToMessage(message, sessionInstructions)
        }

        while (!this.shouldExit) {
            const waitSignal = this.abortController.signal;
            const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal);
            if (!batch) {
                if (waitSignal.aborted && !this.shouldExit) {
                    continue;
                }
                break;
            }

            this.applyDisplayMode(batch.mode.permissionMode);
            messageBuffer.addMessage(batch.message, 'user');

            const messageText = preparePromptText(batch.message)

            const promptContent: PromptContent[] = [{
                type: 'text',
                text: messageText
            }];

            session.onThinkingChange(true);

            try {
                await backend.prompt(acpSessionId, promptContent, (message: AgentMessage) => {
                    this.handleAgentMessage(message);
                });
            } catch (error) {
                logger.warn('[opencode-remote] prompt failed', error);
                session.sendSessionEvent({
                    type: 'message',
                    message: 'OpenCode prompt failed. Check logs for details.'
                });
                messageBuffer.addMessage('OpenCode prompt failed', 'status');
            } finally {
                session.onThinkingChange(false);
                await this.permissionHandler?.cancelAll('Prompt finished');
                await emitReadyIfIdle({
                    queueSize: () => session.queue.size(),
                    shouldExit: () => this.shouldExit,
                    flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
                    sendReady
                });
            }
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager);

        if (this.permissionHandler) {
            await this.permissionHandler.cancelAll('Session ended');
            this.permissionHandler = null;
        }
    }

    private handleAgentMessage(message: AgentMessage): void {
        forwardAcpAgentMessage(message, {
            sendStructuredMessage: (converted) => this.session.sendCodexMessage(converted),
            addMessage: (text, role) => this.messageBuffer.addMessage(text, role)
        });
    }

    private applyDisplayMode(permissionMode: PermissionMode | undefined): void {
        if (permissionMode && permissionMode !== this.displayPermissionMode) {
            this.displayPermissionMode = permissionMode;
            this.messageBuffer.addMessage(`[MODE:${permissionMode}]`, 'system');
        }
    }

    private async handleAbort(): Promise<void> {
        const backend = this.session.getRemoteBackend();
        if (backend && this.session.sessionId) {
            await backend.cancelPrompt(this.session.sessionId);
        }
        await this.permissionHandler?.cancelAll('User aborted');
        this.session.queue.reset();
        this.session.onThinkingChange(false);
        this.abortController.abort();
        this.abortController = new AbortController();
        this.messageBuffer.addMessage('Turn aborted', 'status');
    }

    private async handleExitFromUi(): Promise<void> {
        await this.requestExit('exit', () => this.handleAbort());
    }

    private async handleSwitchFromUi(): Promise<void> {
        await this.requestExit('switch', () => this.handleAbort());
    }

    private async handleSwitchRequest(): Promise<void> {
        await this.requestExit('switch', () => this.handleAbort());
    }
}

export async function opencodeRemoteLauncher(
    session: OpencodeSession
): Promise<'switch' | 'exit'> {
    const launcher = new OpencodeRemoteLauncher(session);
    return launcher.launch();
}
