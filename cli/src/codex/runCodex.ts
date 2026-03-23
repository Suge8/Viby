import { logger } from '@/ui/logger';
import { loop, type EnhancedMode, type PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import type { AgentState } from '@/api/types';
import type { CodexSession } from './session';
import { parseCodexCliOverrides } from './utils/codexCliOverrides';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { assertSessionConfigPayload, resolvePermissionModeForFlavor } from '@/agent/providerConfig';
import { isPermissionModeAllowedForFlavor } from '@viby/protocol';
import type { CodexReasoningEffort } from '@viby/protocol/types';
import { CodexCollaborationModeSchema, CodexReasoningEffortSchema } from '@viby/protocol/schemas';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getInvokedCwd } from '@/utils/invokedCwd';

export { emitReadyIfIdle } from './utils/emitReadyIfIdle';

export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal';
    vibySessionId?: string;
    codexArgs?: string[];
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    model?: string;
    modelReasoningEffort?: CodexReasoningEffort | null;
    collaborationMode?: EnhancedMode['collaborationMode'];
}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = opts.startedBy ?? 'terminal';

    logger.debug(`[codex] Starting with options: startedBy=${startedBy}`);

    let state: AgentState = {
        controlledByUser: false
    };
    const { api, session } = await bootstrapSession({
        flavor: 'codex',
        sessionId: opts.vibySessionId,
        startedBy,
        workingDirectory,
        agentState: state,
        permissionMode: opts.permissionMode ?? 'default',
        model: opts.model,
        modelReasoningEffort: opts.modelReasoningEffort,
        collaborationMode: opts.collaborationMode ?? 'default'
    });

    const startingMode: 'local' | 'remote' = startedBy === 'runner' ? 'remote' : 'local';

    setControlledByUser(session, startingMode);

    const messageQueue = new MessageQueue2<EnhancedMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
        collaborationMode: mode.collaborationMode
    }));

    const codexCliOverrides = parseCodexCliOverrides(opts.codexArgs);
    const sessionWrapperRef: { current: CodexSession | null } = { current: null };

    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default';
    let currentModel = opts.model;
    let currentModelReasoningEffort: CodexReasoningEffort | null = opts.modelReasoningEffort ?? null;
    let currentCollaborationMode: EnhancedMode['collaborationMode'] = opts.collaborationMode ?? 'default';

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'codex',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive()
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current;
        if (!sessionInstance) {
            return;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setModel(currentModel ?? null);
        sessionInstance.setModelReasoningEffort(currentModelReasoningEffort);
        sessionInstance.setCollaborationMode(currentCollaborationMode);
        logger.debug(
            `[Codex] Synced session config for keepalive: ` +
            `permissionMode=${currentPermissionMode}, model=${currentModel ?? 'auto'}, ` +
            `reasoningEffort=${currentModelReasoningEffort ?? 'auto'}, collaborationMode=${currentCollaborationMode}`
        );
    };

    session.onUserMessage((message) => {
        const sessionPermissionMode = sessionWrapperRef.current?.getPermissionMode();
        if (sessionPermissionMode && isPermissionModeAllowedForFlavor(sessionPermissionMode, 'codex')) {
            currentPermissionMode = sessionPermissionMode as PermissionMode;
        }
        const sessionModel = sessionWrapperRef.current?.getModel();
        if (sessionModel !== undefined) {
            currentModel = sessionModel ?? undefined;
        }
        const sessionModelReasoningEffort = sessionWrapperRef.current?.getModelReasoningEffort();
        if (sessionModelReasoningEffort !== undefined) {
            currentModelReasoningEffort = sessionModelReasoningEffort ?? null;
        }
        const sessionCollaborationMode = sessionWrapperRef.current?.getCollaborationMode();
        if (sessionCollaborationMode) {
            currentCollaborationMode = sessionCollaborationMode;
        }

        const messagePermissionMode = currentPermissionMode;
        logger.debug(
            `[Codex] User message received with permission mode: ${currentPermissionMode}, ` +
            `model: ${currentModel ?? 'auto'}, reasoningEffort: ${currentModelReasoningEffort ?? 'auto'}, ` +
            `collaborationMode: ${currentCollaborationMode}`
        );

        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode ?? 'default',
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            collaborationMode: currentCollaborationMode
        };
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        messageQueue.push(formattedText, enhancedMode);
    });

    const formatFailureReason = (message: string): string => {
        const maxLength = 200;
        if (message.length <= maxLength) {
            return message;
        }
        return `${message.slice(0, maxLength)}...`;
    };

    const resolveCollaborationMode = (value: unknown): EnhancedMode['collaborationMode'] => {
        if (value === null) {
            return 'default';
        }
        const parsed = CodexCollaborationModeSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error('Invalid collaboration mode');
        }
        return parsed.data;
    };

    const resolveModel = (value: unknown): string | null => {
        if (value === null) {
            return null;
        }
        if (typeof value !== 'string') {
            throw new Error('Invalid model');
        }
        const trimmed = value.trim();
        if (!trimmed) {
            throw new Error('Invalid model');
        }
        return trimmed;
    };

    const resolveModelReasoningEffort = (value: unknown): CodexReasoningEffort | null => {
        if (value === null) {
            return null;
        }
        const parsed = CodexReasoningEffortSchema.safeParse(value);
        if (!parsed.success) {
            throw new Error('Invalid model reasoning effort');
        }
        return parsed.data;
    };

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
            modelReasoningEffort?: unknown
            collaborationMode?: unknown
        };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForFlavor(config.permissionMode, 'codex') as PermissionMode;
        }

        if (config.model !== undefined) {
            currentModel = resolveModel(config.model) ?? undefined;
        }

        if (config.modelReasoningEffort !== undefined) {
            currentModelReasoningEffort = resolveModelReasoningEffort(config.modelReasoningEffort);
        }

        if (config.collaborationMode !== undefined) {
            currentCollaborationMode = resolveCollaborationMode(config.collaborationMode);
        }

        syncSessionMode();
        return {
            applied: {
                permissionMode: currentPermissionMode,
                model: currentModel ?? null,
                modelReasoningEffort: currentModelReasoningEffort,
                collaborationMode: currentCollaborationMode
            }
        };
    });

    try {
        await loop({
            path: workingDirectory,
            startingMode,
            messageQueue,
            api,
            session,
            codexArgs: opts.codexArgs,
            codexCliOverrides,
            startedBy,
            permissionMode: currentPermissionMode,
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            collaborationMode: currentCollaborationMode,
            resumeSessionId: opts.resumeSessionId,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[codex] Loop error:', error);
    } finally {
        const localFailure = sessionWrapperRef.current?.localLaunchFailure;
        if (localFailure?.exitReason === 'exit') {
            lifecycle.setExitCode(1);
        }
        await lifecycle.cleanupAndExit();
    }
}
