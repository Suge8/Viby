import { logger } from '@/ui/logger';
import type { SessionPermissionMode } from '@/api/types';
import type { CodexAppServerClient } from '@/codex/codexAppServerClient';
import type { EnhancedMode, PermissionMode } from '@/codex/loop';
import type { CodexSession } from '@/codex/session';
import { buildThreadStartParams } from '@/codex/utils/appServerConfig';

const EMPTY_MCP_SERVERS = {};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizePermissionMode(value: SessionPermissionMode | undefined, fallback?: PermissionMode): PermissionMode {
    if (value === 'default' || value === 'read-only' || value === 'safe-yolo' || value === 'yolo') {
        return value;
    }
    if (fallback === 'default' || fallback === 'read-only' || fallback === 'safe-yolo' || fallback === 'yolo') {
        return fallback;
    }
    return 'default';
}

export function getCodexThreadMode(session: CodexSession, fallback?: EnhancedMode): EnhancedMode {
    return {
        permissionMode: normalizePermissionMode(session.getPermissionMode(), fallback?.permissionMode),
        model: session.getModel() ?? fallback?.model,
        modelReasoningEffort: session.getModelReasoningEffort() ?? fallback?.modelReasoningEffort,
        collaborationMode: session.getCollaborationMode() ?? fallback?.collaborationMode ?? 'default',
        developerInstructions: fallback?.developerInstructions
    };
}

function shouldAttachSessionScopedVibyMcp(session: CodexSession): boolean {
    const teamContext = session.client.getTeamContextSnapshot?.()
    return typeof teamContext?.projectId === 'string' && teamContext.projectId.length > 0
}

export async function ensureCodexThreadStarted(args: {
    session: CodexSession
    appServerClient: CodexAppServerClient
    mode: EnhancedMode
    abortSignal: AbortSignal
    onModelResolved: (value: unknown) => void
}): Promise<string> {
    const mcpServers = shouldAttachSessionScopedVibyMcp(args.session)
        ? (await args.session.ensureRemoteBridge()).mcpServers
        : EMPTY_MCP_SERVERS
    const threadParams = buildThreadStartParams({
        cwd: args.session.path,
        mode: args.mode,
        mcpServers,
        cliOverrides: args.session.codexCliOverrides,
        developerInstructions: args.mode.developerInstructions
    });

    const resumeCandidate = args.session.sessionId;
    if (resumeCandidate) {
        const resumeResponse = await args.appServerClient.resumeThread({
            threadId: resumeCandidate,
            ...threadParams
        }, {
            signal: args.abortSignal
        });
        const resumeRecord = asRecord(resumeResponse);
        const resumeThread = resumeRecord ? asRecord(resumeRecord.thread) : null;
        const resumedThreadId = asString(resumeThread?.id) ?? resumeCandidate;
        args.onModelResolved(resumeRecord?.model);
        logger.debug(`[Codex] Resumed app-server thread ${resumedThreadId}`);
        return resumedThreadId;
    }

    const threadResponse = await args.appServerClient.startThread(threadParams, {
        signal: args.abortSignal
    });
    const threadRecord = asRecord(threadResponse);
    const thread = threadRecord ? asRecord(threadRecord.thread) : null;
    const threadId = asString(thread?.id);
    args.onModelResolved(threadRecord?.model);
    if (!threadId) {
        throw new Error('app-server thread/start did not return thread.id');
    }
    return threadId;
}
