import { logger } from '@/ui/logger';
import { loop } from '@/claude/loop';
import { AgentState, ClaudeSessionModelReasoningEffort, SessionModel, TeamSessionSpawnRole } from '@/api/types';
import { EnhancedMode, PermissionMode } from './loop';
import { MessageQueue2 } from '@/utils/MessageQueue2';
import { hashObject } from '@/utils/deterministicJson';
import { extractSDKMetadataAsync } from '@/claude/sdk/metadataExtractor';
import { parseSpecialCommand } from '@/parsers/specialCommands';
import { getEnvironmentInfo } from '@/ui/doctor';
import { startVibyServer } from '@/claude/utils/startVibyServer';
import { startHookServer } from '@/claude/utils/startHookServer';
import { generateHookSettingsFile, cleanupHookSettingsFile } from '@/modules/common/hooks/generateHookSettings';
import { registerKillSessionHandler } from './registerKillSessionHandler';
import type { Session } from './session';
import { bootstrapSession } from '@/agent/sessionFactory';
import { createModeChangeHandler, createRunnerLifecycle, setControlledByUser } from '@/agent/runnerLifecycle';
import { assertSessionConfigPayload, resolvePermissionModeForFlavor } from '@/agent/providerConfig';
import { isPermissionModeAllowedForFlavor } from '@viby/protocol';
import { ClaudeReasoningEffortSchema } from '@viby/protocol/schemas';
import { formatMessageWithAttachments } from '@/utils/attachmentFormatter';
import { normalizeClaudeSessionModel } from './model';
import { getInvokedCwd } from '@/utils/invokedCwd';
import { mergePromptSegments, resolveTeamRolePromptContract } from '@/agent/teamPromptContract';

export interface StartOptions {
    vibySessionId?: string
    sessionRole?: TeamSessionSpawnRole
    model?: string
    modelReasoningEffort?: ClaudeSessionModelReasoningEffort
    permissionMode?: PermissionMode
    startingMode?: 'local' | 'remote'
    shouldStartRunner?: boolean
    claudeEnvVars?: Record<string, string>
    claudeArgs?: string[]
    startedBy?: 'runner' | 'terminal'
}

type StickyStringMessageMetaKey =
    | 'customSystemPrompt'
    | 'fallbackModel'
    | 'appendSystemPrompt'

type StickyListMessageMetaKey =
    | 'allowedTools'
    | 'disallowedTools'

function hasMessageMetaOverride(meta: Record<string, unknown> | null | undefined, key: string): boolean {
    return Boolean(meta) && Object.prototype.hasOwnProperty.call(meta, key)
}

function readOptionalString(value: unknown): string | undefined {
    return (value as string | null | undefined) || undefined
}

function readOptionalStringList(value: unknown): string[] | undefined {
    return (value as string[] | null | undefined) || undefined
}

function formatOverridePresence(value: unknown, emptyLabel: string): string {
    return value ? 'set' : emptyLabel
}

function formatOptionalStringValue(value: string | undefined, emptyLabel: string): string {
    return value || emptyLabel
}

function formatOptionalStringListValue(value: string[] | undefined, emptyLabel: string): string {
    return value ? value.join(', ') : emptyLabel
}

function resolveStickyOverride<TValue>(options: {
    meta: Record<string, unknown> | null | undefined
    key: StickyStringMessageMetaKey | StickyListMessageMetaKey
    currentValue: TValue | undefined
    updatedLabel: string
    missingLabel: string
    read: (value: unknown) => TValue | undefined
    formatUpdatedValue: (value: TValue | undefined) => string
    formatCurrentValue: (value: TValue | undefined) => string
}): TValue | undefined {
    if (hasMessageMetaOverride(options.meta, options.key)) {
        const nextValue = options.read(options.meta?.[options.key])
        logger.debug(`[loop] ${options.updatedLabel} updated from user message: ${options.formatUpdatedValue(nextValue)}`)
        return nextValue
    }

    logger.debug(`[loop] User message received with no ${options.missingLabel} override, using current: ${options.formatCurrentValue(options.currentValue)}`)
    return options.currentValue
}

export async function runClaude(options: StartOptions = {}): Promise<void> {
    const workingDirectory = getInvokedCwd();
    const startedBy = options.startedBy ?? 'terminal';

    // Log environment info at startup
    logger.debugLargeJson('[START] VIBY process started', getEnvironmentInfo());
    logger.debug(`[START] Options: startedBy=${startedBy}, startingMode=${options.startingMode}`);

    // Validate runner spawn requirements
    if (startedBy === 'runner' && options.startingMode === 'local') {
        logger.debug('Runner spawn requested with local mode - forcing remote mode');
        options.startingMode = 'remote';
        // TODO: Eventually we should error here instead of silently switching
        // throw new Error('Runner-spawned sessions cannot use local/interactive mode');
    }

    const initialState: AgentState = {};
    const initialModel = normalizeClaudeSessionModel(options.model);
    const { api, session, sessionInfo } = await bootstrapSession({
        flavor: 'claude',
        sessionId: options.vibySessionId,
        startedBy,
        workingDirectory,
        agentState: initialState,
        sessionRole: options.sessionRole,
        permissionMode: options.permissionMode ?? 'default',
        model: initialModel ?? undefined,
        modelReasoningEffort: options.modelReasoningEffort
    });
    logger.debug(`Session created: ${sessionInfo.id}`);
    const teamRolePromptContract = resolveTeamRolePromptContract(sessionInfo.teamContext);

    // Extract SDK metadata in background and update session when ready
    extractSDKMetadataAsync(async (sdkMetadata) => {
        logger.debug('[start] SDK metadata extracted, updating session:', sdkMetadata);
        try {
            // Update session metadata with tools and slash commands
            session.updateMetadata((currentMetadata) => ({
                ...currentMetadata,
                tools: sdkMetadata.tools,
                slashCommands: sdkMetadata.slashCommands
            }), {
                touchUpdatedAt: false
            });
            logger.debug('[start] Session metadata updated with SDK capabilities');
        } catch (error) {
            logger.debug('[start] Failed to update session metadata:', error);
        }
    });

    // Start VIBY MCP server
    const vibyServer = await startVibyServer(session);
    logger.debug(`[START] VIBY MCP server started at ${vibyServer.url}`);

    // Variable to track current session instance (updated via onSessionReady callback)
    const currentSessionRef: { current: Session | null } = { current: null };

    const formatFailureReason = (message: string): string => {
        const maxLength = 200;
        if (message.length <= maxLength) {
            return message;
        }
        return `${message.slice(0, maxLength)}...`;
    };

    // Start Hook server for receiving Claude session notifications
    const hookServer = await startHookServer({
        onSessionHook: (sessionId, data) => {
            logger.debug(`[START] Session hook received: ${sessionId}`, data);

            const currentSession = currentSessionRef.current;
            if (currentSession) {
                const previousSessionId = currentSession.sessionId;
                if (previousSessionId !== sessionId) {
                    logger.debug(`[START] Claude session ID changed: ${previousSessionId} -> ${sessionId}`);
                    currentSession.onSessionFound(sessionId);
                }
            }
        }
    });
    logger.debug(`[START] Hook server started on port ${hookServer.port}`);

    const hookSettingsPath = generateHookSettingsFile(hookServer.port, hookServer.token, {
        filenamePrefix: 'session-hook',
        logLabel: 'generateHookSettings'
    });
    logger.debug(`[START] Generated hook settings file: ${hookSettingsPath}`);

    // Print log file path
    const logPath = logger.logFilePath;
    logger.infoDeveloper(`Session: ${sessionInfo.id}`);
    logger.infoDeveloper(`Logs: ${logPath}`);

    const lifecycle = createRunnerLifecycle({
        session,
        logTag: 'claude',
        stopKeepAlive: () => currentSessionRef.current?.stopKeepAlive(),
        onAfterClose: () => {
            vibyServer.stop();
            hookServer.stop();
            cleanupHookSettingsFile(hookSettingsPath, 'generateHookSettings');
        }
    });

    lifecycle.registerProcessHandlers();
    registerKillSessionHandler(session.rpcHandlerManager, lifecycle.cleanupAndExit);

    // Set initial agent state
    const startingMode = options.startingMode ?? (startedBy === 'runner' ? 'remote' : 'local');
    setControlledByUser(session, startingMode);

    // Import MessageQueue2 and create message queue
    const messageQueue = new MessageQueue2<EnhancedMode>(mode => hashObject({
        isPlan: mode.permissionMode === 'plan',
        model: mode.model,
        modelReasoningEffort: mode.modelReasoningEffort,
        fallbackModel: mode.fallbackModel,
        customSystemPrompt: mode.customSystemPrompt,
        appendSystemPrompt: mode.appendSystemPrompt,
        allowedTools: mode.allowedTools,
        disallowedTools: mode.disallowedTools
    }));

    // Forward messages to the queue
    let currentPermissionMode: PermissionMode = options.permissionMode ?? 'default';
    let currentModel: SessionModel = initialModel;
    let currentModelReasoningEffort: ClaudeSessionModelReasoningEffort = options.modelReasoningEffort ?? null;
    let currentFallbackModel: string | undefined = undefined; // Track current fallback model
    let currentCustomSystemPrompt: string | undefined = undefined; // Track current custom system prompt
    let currentAppendSystemPromptOverride: string | undefined = undefined; // Track current append system prompt override
    let currentAllowedTools: string[] | undefined = undefined; // Track current allowed tools
    let currentDisallowedTools: string[] | undefined = undefined; // Track current disallowed tools

    const syncSessionModes = () => {
        const sessionInstance = currentSessionRef.current;
        if (!sessionInstance) {
            return;
        }
        sessionInstance.setPermissionMode(currentPermissionMode);
        sessionInstance.setModel(currentModel);
        sessionInstance.setModelReasoningEffort(currentModelReasoningEffort);
        logger.debug(
            `[loop] Synced session config for keepalive: permissionMode=${currentPermissionMode}, ` +
            `model=${currentModel ?? 'auto'}, reasoningEffort=${currentModelReasoningEffort ?? 'auto'}`
        );
    };
    session.onUserMessage((message) => {
        const messageMeta = (message.meta ?? null) as Record<string, unknown> | null;
        const sessionPermissionMode = currentSessionRef.current?.getPermissionMode();
        if (sessionPermissionMode && isPermissionModeAllowedForFlavor(sessionPermissionMode, 'claude')) {
            currentPermissionMode = sessionPermissionMode as PermissionMode;
        }
        const sessionModel = currentSessionRef.current?.getModel();
        if (sessionModel !== undefined) {
            currentModel = sessionModel;
        }
        const sessionModelReasoningEffort = currentSessionRef.current?.getModelReasoningEffort();
        if (sessionModelReasoningEffort !== undefined) {
            currentModelReasoningEffort = sessionModelReasoningEffort;
        }
        const messagePermissionMode = currentPermissionMode;
        const messageModel = currentModel ?? undefined;
        logger.debug(
            `[loop] User message received with permission mode: ${currentPermissionMode}, ` +
            `model: ${currentModel ?? 'auto'}, reasoningEffort: ${currentModelReasoningEffort ?? 'auto'}`
        );

        // Resolve custom system prompt - use message.meta.customSystemPrompt if provided, otherwise use current
        const messageCustomSystemPrompt = resolveStickyOverride({
            meta: messageMeta,
            key: 'customSystemPrompt',
            currentValue: currentCustomSystemPrompt,
            updatedLabel: 'Custom system prompt',
            missingLabel: 'custom system prompt',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOverridePresence(value, 'reset to none'),
            formatCurrentValue: (value) => formatOverridePresence(value, 'none')
        });
        currentCustomSystemPrompt = messageCustomSystemPrompt;

        // Resolve fallback model - use message.meta.fallbackModel if provided, otherwise use current fallback model
        const messageFallbackModel = resolveStickyOverride({
            meta: messageMeta,
            key: 'fallbackModel',
            currentValue: currentFallbackModel,
            updatedLabel: 'Fallback model',
            missingLabel: 'fallback model',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOptionalStringValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringValue(value, 'none')
        });
        currentFallbackModel = messageFallbackModel;

        // Resolve append system prompt - use message.meta.appendSystemPrompt if provided, otherwise use current
        const messageAppendSystemPromptOverride = resolveStickyOverride({
            meta: messageMeta,
            key: 'appendSystemPrompt',
            currentValue: currentAppendSystemPromptOverride,
            updatedLabel: 'Append system prompt override',
            missingLabel: 'append system prompt',
            read: readOptionalString,
            formatUpdatedValue: (value) => formatOverridePresence(value, 'reset to none'),
            formatCurrentValue: (value) => formatOverridePresence(value, 'none')
        });
        currentAppendSystemPromptOverride = messageAppendSystemPromptOverride;
        const messageAppendSystemPrompt = mergePromptSegments(teamRolePromptContract, messageAppendSystemPromptOverride);

        // Resolve allowed tools - use message.meta.allowedTools if provided, otherwise use current
        const messageAllowedTools = resolveStickyOverride({
            meta: messageMeta,
            key: 'allowedTools',
            currentValue: currentAllowedTools,
            updatedLabel: 'Allowed tools',
            missingLabel: 'allowed tools',
            read: readOptionalStringList,
            formatUpdatedValue: (value) => formatOptionalStringListValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringListValue(value, 'none')
        });
        currentAllowedTools = messageAllowedTools;

        // Resolve disallowed tools - use message.meta.disallowedTools if provided, otherwise use current
        const messageDisallowedTools = resolveStickyOverride({
            meta: messageMeta,
            key: 'disallowedTools',
            currentValue: currentDisallowedTools,
            updatedLabel: 'Disallowed tools',
            missingLabel: 'disallowed tools',
            read: readOptionalStringList,
            formatUpdatedValue: (value) => formatOptionalStringListValue(value, 'reset to none'),
            formatCurrentValue: (value) => formatOptionalStringListValue(value, 'none')
        });
        currentDisallowedTools = messageDisallowedTools;

        // Check for special commands before processing
        const specialCommand = parseSpecialCommand(message.content.text);

        // Format message text with attachments for Claude
        const formattedText = formatMessageWithAttachments(message.content.text, message.content.attachments);

        if (specialCommand.type === 'compact') {
            logger.debug('[start] Detected /compact command');
            const enhancedMode: EnhancedMode = {
                permissionMode: messagePermissionMode ?? 'default',
                model: messageModel,
                modelReasoningEffort: currentModelReasoningEffort,
                fallbackModel: messageFallbackModel,
                customSystemPrompt: messageCustomSystemPrompt,
                appendSystemPrompt: messageAppendSystemPrompt,
                allowedTools: messageAllowedTools,
                disallowedTools: messageDisallowedTools
            };
            // Use raw text only, ignore attachments for special commands
            const commandText = specialCommand.originalMessage || message.content.text;
            messageQueue.pushIsolateAndClear(commandText, enhancedMode);
            logger.debugLargeJson('[start] /compact command pushed to queue:', message);
            return;
        }

        if (specialCommand.type === 'clear') {
            logger.debug('[start] Detected /clear command');
            const enhancedMode: EnhancedMode = {
                permissionMode: messagePermissionMode ?? 'default',
                model: messageModel,
                modelReasoningEffort: currentModelReasoningEffort,
                fallbackModel: messageFallbackModel,
                customSystemPrompt: messageCustomSystemPrompt,
                appendSystemPrompt: messageAppendSystemPrompt,
                allowedTools: messageAllowedTools,
                disallowedTools: messageDisallowedTools
            };
            // Use raw text only, ignore attachments for special commands
            const commandText = specialCommand.originalMessage || message.content.text;
            messageQueue.pushIsolateAndClear(commandText, enhancedMode);
            logger.debugLargeJson('[start] /clear command pushed to queue:', message);
            return;
        }

        // Push with resolved permission mode, model, system prompts, and tools
        const enhancedMode: EnhancedMode = {
            permissionMode: messagePermissionMode ?? 'default',
            model: messageModel,
            modelReasoningEffort: currentModelReasoningEffort,
            fallbackModel: messageFallbackModel,
            customSystemPrompt: messageCustomSystemPrompt,
            appendSystemPrompt: messageAppendSystemPrompt,
            allowedTools: messageAllowedTools,
            disallowedTools: messageDisallowedTools
        };
        messageQueue.push(formattedText, enhancedMode);
        logger.debugLargeJson('User message pushed to queue:', message)
    });

    const resolveModel = (value: unknown): SessionModel => {
        if (value === null) {
            return null;
        }

        if (typeof value !== 'string') {
            throw new Error('Invalid model');
        }

        return normalizeClaudeSessionModel(value);
    };

    const resolveModelReasoningEffort = (value: unknown): ClaudeSessionModelReasoningEffort => {
        if (value === null) {
            return null;
        }

        const parsed = ClaudeReasoningEffortSchema.safeParse(value);
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
        };

        if (config.permissionMode !== undefined) {
            currentPermissionMode = resolvePermissionModeForFlavor(config.permissionMode, 'claude') as PermissionMode;
        }

        if (config.model !== undefined) {
            currentModel = resolveModel(config.model);
        }

        if (config.modelReasoningEffort !== undefined) {
            currentModelReasoningEffort = resolveModelReasoningEffort(config.modelReasoningEffort);
        }

        syncSessionModes();
        return {
            applied: {
                permissionMode: currentPermissionMode,
                model: currentModel,
                modelReasoningEffort: currentModelReasoningEffort
            }
        };
    });

    let loopError: unknown = null;
    let loopFailed = false;
    try {
        await loop({
            path: workingDirectory,
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            permissionMode: options.permissionMode,
            startingMode,
            messageQueue,
            api,
            allowedTools: vibyServer.toolNames.map(toolName => `mcp__viby__${toolName}`),
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (sessionInstance) => {
                currentSessionRef.current = sessionInstance;
                syncSessionModes();
            },
            mcpServers: {
                'viby': {
                    type: 'http' as const,
                    url: vibyServer.url,
                }
            },
            session,
            claudeEnvVars: options.claudeEnvVars,
            claudeArgs: options.claudeArgs,
            startedBy,
            hookSettingsPath
        });
    } catch (error) {
        loopError = error;
        loopFailed = true;
        lifecycle.markCrash(error);
    }

    const localFailure = currentSessionRef.current?.localLaunchFailure;
    if (localFailure?.exitReason === 'exit') {
        lifecycle.setExitCode(1);
    }

    if (loopFailed) {
        await lifecycle.cleanup();
        throw loopError;
    }

    await lifecycle.cleanupAndExit();
}
