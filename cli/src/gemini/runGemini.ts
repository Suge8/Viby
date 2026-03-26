import { logger } from '@/ui/logger';
import { geminiLoop } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { registerKillSessionHandler } from '@/claude/registerKillSessionHandler';
import type { AgentState, TeamSessionSpawnRole } from '@/api/types';
import type { GeminiSession } from './session';
import type { GeminiMode, PermissionMode } from './types';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { startHookServer } from '@/claude/utils/startHookServer';
import { cleanupHookSettingsFile, generateHookSettingsFile } from '@/modules/common/hooks/generateHookSettings';
import { resolveGeminiRuntimeConfig } from './utils/config';
import { assertSessionConfigPayload, resolvePermissionModeForFlavor } from '@/agent/providerConfig';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { getInvokedCwd } from '@/utils/invokedCwd';

function resolveSessionModel(value: unknown): string | null {
    if (value === null) {
        return null;
    }

    if (typeof value !== 'string') {
        throw new Error('Invalid model');
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
        throw new Error('Invalid model');
    }

    return trimmedValue;
}

export async function runGemini(opts: {
    startedBy?: 'runner' | 'terminal';
    vibySessionId?: string;
    sessionRole?: TeamSessionSpawnRole;
    startingMode?: 'local' | 'remote';
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    model?: string;
} = {}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = opts.startedBy ?? 'terminal';
    const requestedStartingMode = opts.startingMode;

    logger.debug(`[gemini] Starting with options: startedBy=${startedBy}, startingMode=${requestedStartingMode}`);

    if (startedBy === 'runner' && requestedStartingMode === 'local') {
        logger.debug('[gemini] Runner spawn requested with local mode; forcing remote mode');
    }

    const initialState: AgentState = {
        controlledByUser: false
    };

    const runtimeConfig = resolveGeminiRuntimeConfig({ model: opts.model });
    let currentModel = runtimeConfig.model ?? null;

    const { api, session } = await bootstrapSession({
        flavor: 'gemini',
        sessionId: opts.vibySessionId,
        startedBy,
        workingDirectory,
        agentState: initialState,
        sessionRole: opts.sessionRole,
        permissionMode: opts.permissionMode ?? 'default',
        model: currentModel ?? undefined
    });

    const startingMode: 'local' | 'remote' = (startedBy === 'runner' && requestedStartingMode === 'local')
        ? 'remote'
        : requestedStartingMode
        ?? (startedBy === 'runner' ? 'remote' : 'local');

    setControlledByUser(session, startingMode);

    const messageQueue = new MessageQueue2<GeminiMode>((mode) => hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model
    }));

    const sessionWrapperRef: { current: GeminiSession | null } = { current: null };
    let currentPermissionMode: PermissionMode = opts.permissionMode ?? 'default';

    const hookServer = await startHookServer({
        onSessionHook: (sessionId, data) => {
            logger.debug(`[gemini] Session hook received: ${sessionId}`);
            const currentSession = sessionWrapperRef.current;
            if (!currentSession) {
                return;
            }
            if (currentSession.sessionId !== sessionId) {
                currentSession.onSessionFound(sessionId);
            }
            if (typeof data.transcript_path === 'string') {
                currentSession.onTranscriptPathFound(data.transcript_path);
            }
        }
    });

    const hookSettingsPath = generateHookSettingsFile(hookServer.port, hookServer.token, {
        filenamePrefix: 'gemini-session-hook',
        logLabel: 'gemini-hook-settings',
        hooksEnabled: true
    });

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'gemini',
        stopKeepAlive: () => sessionWrapperRef.current?.stopKeepAlive(),
        onBeforeClose: async () => {
            await sessionWrapperRef.current?.disposeRemoteRuntime();
        },
        onAfterClose: () => {
            hookServer.stop();
            cleanupHookSettingsFile(hookSettingsPath, 'gemini-hook-settings');
        }
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    const syncSessionMode = () => {
        const sessionInstance = sessionWrapperRef.current;
        if (!sessionInstance) {
            return;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setModel(currentModel);
        logger.debug(
            `[gemini] Synced session mode for keepalive: permissionMode=${currentPermissionMode}, model=${currentModel ?? 'auto'}`
        );
    };

    session.onUserMessage((message) => {
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);
        const mode: GeminiMode = {
            permissionMode: currentPermissionMode,
            model: currentModel ?? undefined
        };
        messageQueue.push(formattedText, mode);
    });

    session.rpcHandlerManager.registerHandler('set-session-config', async (payload: unknown) => {
        const config = assertSessionConfigPayload(payload) as {
            permissionMode?: unknown
            model?: unknown
        };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForFlavor(config.permissionMode, 'gemini') as PermissionMode;
        }

        if (config.model !== undefined) {
            currentModel = resolveSessionModel(config.model);
        }

        syncSessionMode();
        return {
            applied: {
                permissionMode: currentPermissionMode,
                model: currentModel
            }
        };
    });

    try {
        await geminiLoop({
            path: workingDirectory,
            startingMode,
            startedBy,
            messageQueue,
            session,
            api,
            permissionMode: currentPermissionMode,
            resumeSessionId: opts.resumeSessionId,
            model: currentModel ?? undefined,
            hookSettingsPath,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
    } catch (error) {
        lifecycle.markCrash(error);
        logger.debug('[gemini] Loop error:', error);
    } finally {
        const localFailure = sessionWrapperRef.current?.localLaunchFailure;
        if (localFailure?.exitReason === 'exit') {
            lifecycle.setExitCode(1);
        }
        await lifecycle.cleanupAndExit();
    }
}
