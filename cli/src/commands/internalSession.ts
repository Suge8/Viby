import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { initializeToken } from '@/ui/tokenInit'
import { runClaude } from '@/claude/runClaude'
import { runCodex } from '@/codex/runCodex'
import { runCursor } from '@/cursor/runCursor'
import { runGemini } from '@/gemini/runGemini'
import { runOpencode } from '@/opencode/runOpencode'
import { isPermissionModeAllowedForFlavor } from '@viby/protocol'
import {
    ClaudeReasoningEffortSchema,
    CodexCollaborationModeSchema,
    CodexReasoningEffortSchema,
    ModelReasoningEffortSchema,
    PermissionModeSchema,
    TeamSessionSpawnRoleSchema
} from '@viby/protocol/schemas'
import type {
    SessionCollaborationMode,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    TeamSessionSpawnRole
} from '@/api/types'
import type {
    ClaudePermissionMode,
    CodexPermissionMode,
    CursorPermissionMode,
    GeminiPermissionMode,
    OpencodePermissionMode
} from '@viby/protocol/types'
import type { CommandDefinition } from './types'

export const INTERNAL_SESSION_COMMAND = '__internal_spawn_session'

type InternalAgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'

type InternalSessionOptions = {
    agent: InternalAgentFlavor
    startedBy: 'runner' | 'terminal'
    startingMode?: 'local' | 'remote'
    vibySessionId?: string
    resumeSessionId?: string
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
    permissionMode?: SessionPermissionMode
    sessionRole?: TeamSessionSpawnRole
    collaborationMode?: SessionCollaborationMode
}

function parseInternalSessionArgs(args: string[]): InternalSessionOptions {
    let agent: InternalAgentFlavor | null = null
    let startedBy: 'runner' | 'terminal' = 'runner'
    let startingMode: 'local' | 'remote' | undefined
    let vibySessionId: string | undefined
    let resumeSessionId: string | undefined
    let model: string | undefined
    let modelReasoningEffort: SessionModelReasoningEffort | undefined
    let permissionMode: SessionPermissionMode | undefined
    let sessionRole: TeamSessionSpawnRole | undefined
    let collaborationMode: SessionCollaborationMode | undefined

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--agent') {
            const value = args[index + 1]
            if (
                value !== 'claude'
                && value !== 'codex'
                && value !== 'cursor'
                && value !== 'gemini'
                && value !== 'opencode'
            ) {
                throw new Error('Missing or invalid --agent value')
            }
            agent = value
            index += 1
            continue
        }

        if (arg === '--started-by') {
            const value = args[index + 1]
            if (value !== 'runner' && value !== 'terminal') {
                throw new Error('Missing or invalid --started-by value')
            }
            startedBy = value
            index += 1
            continue
        }

        if (arg === '--starting-mode') {
            const value = args[index + 1]
            if (value !== 'local' && value !== 'remote') {
                throw new Error('Missing or invalid --starting-mode value')
            }
            startingMode = value
            index += 1
            continue
        }

        if (arg === '--resume-session-id') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --resume-session-id value')
            }
            resumeSessionId = value
            index += 1
            continue
        }

        if (arg === '--viby-session-id') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --viby-session-id value')
            }
            vibySessionId = value
            index += 1
            continue
        }

        if (arg === '--model') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --model value')
            }
            model = value
            index += 1
            continue
        }

        if (arg === '--model-reasoning-effort') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --model-reasoning-effort value')
            }
            const parsed = ModelReasoningEffortSchema.safeParse(value)
            if (!parsed.success) {
                throw new Error('Invalid --model-reasoning-effort value')
            }
            modelReasoningEffort = parsed.data
            index += 1
            continue
        }

        if (arg === '--permission-mode') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --permission-mode value')
            }
            const parsed = PermissionModeSchema.safeParse(value)
            if (!parsed.success) {
                throw new Error('Invalid --permission-mode value')
            }
            permissionMode = parsed.data
            index += 1
            continue
        }

        if (arg === '--session-role') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --session-role value')
            }
            const parsed = TeamSessionSpawnRoleSchema.safeParse(value)
            if (!parsed.success) {
                throw new Error('Invalid --session-role value')
            }
            sessionRole = parsed.data
            index += 1
            continue
        }

        if (arg === '--collaboration-mode') {
            const value = args[index + 1]
            if (!value) {
                throw new Error('Missing --collaboration-mode value')
            }
            const parsed = CodexCollaborationModeSchema.safeParse(value)
            if (!parsed.success) {
                throw new Error('Invalid --collaboration-mode value')
            }
            collaborationMode = parsed.data
            index += 1
            continue
        }

        throw new Error(`Unknown internal session argument: ${arg}`)
    }

    if (!agent) {
        throw new Error('Missing --agent value')
    }

    return {
        agent,
        startedBy,
        startingMode,
        vibySessionId,
        resumeSessionId,
        model,
        modelReasoningEffort,
        permissionMode,
        sessionRole,
        collaborationMode
    }
}

async function prepareInternalSessionStart(): Promise<void> {
    await initializeToken()
    await authAndSetupMachineIfNeeded()
}

function resolvePermissionModeForAgent(
    agent: InternalAgentFlavor,
    permissionMode: SessionPermissionMode | undefined
): SessionPermissionMode | undefined {
    if (!permissionMode) {
        return undefined
    }
    if (!isPermissionModeAllowedForFlavor(permissionMode, agent)) {
        throw new Error(`Invalid permission mode for ${agent}`)
    }
    return permissionMode
}

function resolveClaudePermissionMode(
    permissionMode: SessionPermissionMode | undefined
): ClaudePermissionMode | undefined {
    const resolved = resolvePermissionModeForAgent('claude', permissionMode)
    return resolved as ClaudePermissionMode | undefined
}

function resolveCodexPermissionMode(
    permissionMode: SessionPermissionMode | undefined
): CodexPermissionMode | undefined {
    const resolved = resolvePermissionModeForAgent('codex', permissionMode)
    return resolved as CodexPermissionMode | undefined
}

function resolveCursorPermissionMode(
    permissionMode: SessionPermissionMode | undefined
): CursorPermissionMode | undefined {
    const resolved = resolvePermissionModeForAgent('cursor', permissionMode)
    return resolved as CursorPermissionMode | undefined
}

function resolveGeminiPermissionMode(
    permissionMode: SessionPermissionMode | undefined
): GeminiPermissionMode | undefined {
    const resolved = resolvePermissionModeForAgent('gemini', permissionMode)
    return resolved as GeminiPermissionMode | undefined
}

function resolveOpencodePermissionMode(
    permissionMode: SessionPermissionMode | undefined
): OpencodePermissionMode | undefined {
    const resolved = resolvePermissionModeForAgent('opencode', permissionMode)
    return resolved as OpencodePermissionMode | undefined
}

function resolveCodexCollaborationMode(
    agent: InternalAgentFlavor,
    collaborationMode: SessionCollaborationMode | undefined
): SessionCollaborationMode | undefined {
    if (!collaborationMode) {
        return undefined
    }
    if (agent !== 'codex') {
        throw new Error('Collaboration mode is only supported for Codex')
    }
    return collaborationMode
}

async function runInternalClaude(options: InternalSessionOptions): Promise<void> {
    const permissionMode = resolveClaudePermissionMode(options.permissionMode)
    const claudeArgs = options.resumeSessionId
        ? ['--resume', options.resumeSessionId]
        : undefined
    const modelReasoningEffort = options.modelReasoningEffort === undefined
        ? undefined
        : (() => {
            const parsed = ClaudeReasoningEffortSchema.safeParse(options.modelReasoningEffort)
            if (!parsed.success) {
                throw new Error('Invalid Claude model reasoning effort')
            }
            return parsed.data
        })()

    await runClaude({
        startedBy: options.startedBy,
        vibySessionId: options.vibySessionId,
        startingMode: options.startingMode,
        sessionRole: options.sessionRole,
        permissionMode,
        model: options.model,
        modelReasoningEffort,
        claudeArgs
    })
}

async function runInternalCodex(options: InternalSessionOptions): Promise<void> {
    const permissionMode = resolveCodexPermissionMode(options.permissionMode)
    const collaborationMode = resolveCodexCollaborationMode('codex', options.collaborationMode)
    const modelReasoningEffort = options.modelReasoningEffort === undefined
        ? undefined
        : (() => {
            const parsed = CodexReasoningEffortSchema.safeParse(options.modelReasoningEffort)
            if (!parsed.success) {
                throw new Error('Invalid Codex model reasoning effort')
            }
            return parsed.data
        })()

    await runCodex({
        startedBy: options.startedBy,
        vibySessionId: options.vibySessionId,
        sessionRole: options.sessionRole,
        permissionMode,
        resumeSessionId: options.resumeSessionId,
        model: options.model,
        modelReasoningEffort,
        collaborationMode
    })
}

async function runInternalCursor(options: InternalSessionOptions): Promise<void> {
    await runCursor({
        startedBy: options.startedBy,
        vibySessionId: options.vibySessionId,
        sessionRole: options.sessionRole,
        permissionMode: resolveCursorPermissionMode(options.permissionMode),
        resumeSessionId: options.resumeSessionId,
        model: options.model
    })
}

async function runInternalGemini(options: InternalSessionOptions): Promise<void> {
    await runGemini({
        startedBy: options.startedBy,
        vibySessionId: options.vibySessionId,
        startingMode: options.startingMode,
        sessionRole: options.sessionRole,
        permissionMode: resolveGeminiPermissionMode(options.permissionMode),
        resumeSessionId: options.resumeSessionId,
        model: options.model
    })
}

async function runInternalOpencode(options: InternalSessionOptions): Promise<void> {
    await runOpencode({
        startedBy: options.startedBy,
        vibySessionId: options.vibySessionId,
        startingMode: options.startingMode,
        sessionRole: options.sessionRole,
        permissionMode: resolveOpencodePermissionMode(options.permissionMode),
        resumeSessionId: options.resumeSessionId
    })
}

export const internalSessionCommand: CommandDefinition = {
    name: INTERNAL_SESSION_COMMAND,
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const options = parseInternalSessionArgs(commandArgs)

        await prepareInternalSessionStart()

        switch (options.agent) {
            case 'claude':
                await runInternalClaude(options)
                return
            case 'codex':
                await runInternalCodex(options)
                return
            case 'cursor':
                await runInternalCursor(options)
                return
            case 'gemini':
                await runInternalGemini(options)
                return
            case 'opencode':
                await runInternalOpencode(options)
                return
        }
    }
}
