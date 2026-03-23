import type { EnhancedMode } from '../loop';
import type { CodexCliOverrides } from './codexCliOverrides';
import { codexSystemPrompt } from './systemPrompt';
import type {
    ApprovalPolicy,
    CollaborationMode,
    SandboxMode,
    SandboxPolicy,
    ThreadStartParams,
    TurnStartParams
} from '../appServerTypes';
import { resolveCodexPermissionModeConfig } from './permissionModeConfig';

type McpServersConfig = Record<string, { command: string; args: string[] }>;

function resolveApprovalPolicy(mode: EnhancedMode): ApprovalPolicy {
    return resolveCodexPermissionModeConfig(mode.permissionMode).approvalPolicy;
}

function resolveSandbox(mode: EnhancedMode): SandboxMode {
    return resolveCodexPermissionModeConfig(mode.permissionMode).sandbox;
}

function resolveSandboxPolicy(mode: EnhancedMode): SandboxPolicy {
    return resolveCodexPermissionModeConfig(mode.permissionMode).sandboxPolicy;
}

function resolveSandboxPolicyOverride(value: CodexCliOverrides['sandbox'] | undefined): SandboxPolicy | undefined {
    switch (value) {
        case 'read-only':
            return { type: 'readOnly' };
        case 'workspace-write':
            return { type: 'workspaceWrite' };
        case 'danger-full-access':
            return { type: 'dangerFullAccess' };
        default:
            return undefined;
    }
}

function buildMcpServerConfig(mcpServers: McpServersConfig): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    for (const [name, server] of Object.entries(mcpServers)) {
        config[`mcp_servers.${name}`] = {
            command: server.command,
            args: server.args
        };
    }

    return config;
}

function normalizeInstructions(value?: string): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function resolveInstructions(args: {
    baseInstructions?: string;
    developerInstructions?: string;
}): { baseInstructions?: string; developerInstructions?: string } {
    const baseInstructions = normalizeInstructions(args.baseInstructions ?? codexSystemPrompt);
    const extraInstructions = normalizeInstructions(args.developerInstructions);
    const developerInstructions = extraInstructions
        ? (baseInstructions ? `${baseInstructions}\n\n${extraInstructions}` : extraInstructions)
        : baseInstructions;
    return {
        baseInstructions,
        developerInstructions
    };
}

export function buildThreadStartParams(args: {
    cwd: string;
    mode: EnhancedMode;
    mcpServers: McpServersConfig;
    cliOverrides?: CodexCliOverrides;
    baseInstructions?: string;
    developerInstructions?: string;
}): ThreadStartParams {
    const approvalPolicy = resolveApprovalPolicy(args.mode);
    const sandbox = resolveSandbox(args.mode);
    const allowCliOverrides = args.mode.permissionMode === 'default';
    const cliOverrides = allowCliOverrides ? args.cliOverrides : undefined;
    const resolvedApprovalPolicy = cliOverrides?.approvalPolicy ?? approvalPolicy;
    const resolvedSandbox = cliOverrides?.sandbox ?? sandbox;

    const config = buildMcpServerConfig(args.mcpServers);
    const {
        baseInstructions,
        developerInstructions: resolvedDeveloperInstructions
    } = resolveInstructions(args);
    const configWithInstructions = {
        ...config,
        ...(resolvedDeveloperInstructions ? { developer_instructions: resolvedDeveloperInstructions } : {}),
        ...(args.mode.modelReasoningEffort ? { model_reasoning_effort: args.mode.modelReasoningEffort } : {})
    };

    const params: ThreadStartParams = {
        cwd: args.cwd,
        approvalPolicy: resolvedApprovalPolicy,
        sandbox: resolvedSandbox,
        ...(baseInstructions ? { baseInstructions } : {}),
        ...(resolvedDeveloperInstructions ? { developerInstructions: resolvedDeveloperInstructions } : {}),
        ...(Object.keys(configWithInstructions).length > 0 ? { config: configWithInstructions } : {})
    };

    if (args.mode.model) {
        params.model = args.mode.model;
    }

    return params;
}

export function buildTurnStartParams(args: {
    threadId: string;
    message: string;
    cwd: string;
    mode?: EnhancedMode;
    cliOverrides?: CodexCliOverrides;
    baseInstructions?: string;
    developerInstructions?: string;
    overrides?: {
        approvalPolicy?: TurnStartParams['approvalPolicy'];
        sandboxPolicy?: TurnStartParams['sandboxPolicy'];
        model?: string;
    };
}): TurnStartParams {
    const params: TurnStartParams = {
        threadId: args.threadId,
        cwd: args.cwd,
        input: [{ type: 'text', text: args.message }]
    };

    const allowCliOverrides = args.mode?.permissionMode === 'default';
    const cliOverrides = allowCliOverrides ? args.cliOverrides : undefined;
    const approvalPolicy = args.overrides?.approvalPolicy
        ?? cliOverrides?.approvalPolicy
        ?? (args.mode ? resolveApprovalPolicy(args.mode) : undefined);
    if (approvalPolicy) {
        params.approvalPolicy = approvalPolicy;
    }

    const sandboxPolicy = args.overrides?.sandboxPolicy
        ?? resolveSandboxPolicyOverride(cliOverrides?.sandbox)
        ?? (args.mode ? resolveSandboxPolicy(args.mode) : undefined);
    if (sandboxPolicy) {
        params.sandboxPolicy = sandboxPolicy;
    }

    const collaborationMode = args.mode?.collaborationMode;
    const model = args.overrides?.model ?? args.mode?.model;
    const effort = args.mode?.modelReasoningEffort;
    if (collaborationMode) {
        if (!model) {
            throw new Error(`Collaboration mode '${collaborationMode}' requires a resolved model`);
        }
        const { developerInstructions } = resolveInstructions(args);
        const settings: CollaborationMode['settings'] = {
            model,
            ...(effort !== undefined ? { reasoning_effort: effort } : {})
        };
        if (developerInstructions) {
            settings.developer_instructions = developerInstructions;
        }
        params.collaborationMode = {
            mode: collaborationMode,
            settings
        };
    } else if (model) {
        params.model = model;
    }

    if (effort !== undefined) {
        params.effort = effort;
    }

    return params;
}
