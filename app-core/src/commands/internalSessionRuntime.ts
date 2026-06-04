import { performance } from 'node:perf_hooks'
import { isPermissionModeAllowedForDriver } from '@viby/protocol'
import { ClaudeReasoningEffortSchema, CodexReasoningEffortSchema } from '@viby/protocol/schemas'
import type {
    ClaudePermissionMode,
    ClaudeReasoningEffort,
    CodexPermissionMode,
    CodexReasoningEffort,
    CopilotPermissionMode,
    CursorPermissionMode,
    GeminiPermissionMode,
    OpencodePermissionMode,
    PiPermissionMode,
} from '@viby/protocol/types'
import type { SessionCollaborationMode, SessionModelReasoningEffort, SessionPermissionMode } from '@/api/types'
import { logger } from '@/ui/logger'
import type { DriverSwitchBootstrap, InternalAgentFlavor, InternalSessionOptions } from './internalSessionArgs'

const INTERNAL_SESSION_LOG_TAG = '[internal-session]'

function resolvePermissionModeForAgent(
    agent: InternalAgentFlavor,
    permissionMode: SessionPermissionMode | undefined
): SessionPermissionMode | undefined {
    if (!permissionMode) {
        return undefined
    }
    if (!isPermissionModeAllowedForDriver(permissionMode, agent)) {
        throw new Error(`Invalid permission mode for ${agent}`)
    }
    return permissionMode
}

function resolveCollaborationMode(
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

function resolveClaudeReasoningEffort(
    value: SessionModelReasoningEffort | undefined
): ClaudeReasoningEffort | undefined {
    if (value === undefined) {
        return undefined
    }
    const parsed = ClaudeReasoningEffortSchema.safeParse(value)
    if (!parsed.success) {
        throw new Error('Invalid Claude model reasoning effort')
    }
    return parsed.data
}

function resolveCodexReasoningEffort(value: SessionModelReasoningEffort | undefined): CodexReasoningEffort | undefined {
    if (value === undefined) {
        return undefined
    }
    const parsed = CodexReasoningEffortSchema.safeParse(value)
    if (!parsed.success) {
        throw new Error('Invalid Codex model reasoning effort')
    }
    return parsed.data
}

function asDriverSwitchHandoff(
    driverSwitch: DriverSwitchBootstrap | undefined
): DriverSwitchBootstrap['handoffSnapshot'] | undefined {
    return driverSwitch?.handoffSnapshot
}

function withDriverSwitchBootstrap(
    options: InternalSessionOptions
): { driverSwitchBootstrap: true } | Record<string, never> {
    if (options.driverSwitch) {
        return { driverSwitchBootstrap: true }
    }
    return {}
}

async function measureInternalSessionPhase<T>(
    agent: InternalAgentFlavor,
    phase: 'load-provider' | 'run-provider',
    action: () => Promise<T>
): Promise<T> {
    const startedAt = performance.now()

    try {
        return await action()
    } finally {
        const durationMs = Math.round(performance.now() - startedAt)
        logger.debug(`${INTERNAL_SESSION_LOG_TAG} ${agent} ${phase} completed in ${durationMs}ms`)
    }
}

async function loadClaudeProvider(): Promise<typeof import('@/claude/runClaude')['runClaude']> {
    const module = await import('@/claude/runClaude')
    return module.runClaude
}

async function loadCodexProvider(): Promise<typeof import('@/codex/runCodex')['runCodex']> {
    const module = await import('@/codex/runCodex')
    return module.runCodex
}

async function loadCursorProvider(): Promise<typeof import('@/cursor/runCursor')['runCursor']> {
    const module = await import('@/cursor/runCursor')
    return module.runCursor
}

async function loadGeminiProvider(): Promise<typeof import('@/gemini/runGemini')['runGemini']> {
    const module = await import('@/gemini/runGemini')
    return module.runGemini
}

async function loadOpencodeProvider(): Promise<typeof import('@/opencode/runOpencode')['runOpencode']> {
    const module = await import('@/opencode/runOpencode')
    return module.runOpencode
}

async function loadCopilotProvider(): Promise<typeof import('@/copilot/runCopilot')['runCopilot']> {
    const module = await import('@/copilot/runCopilot')
    return module.runCopilot
}

async function runInternalPi(options: InternalSessionOptions): Promise<void> {
    const runPi = await measureInternalSessionPhase('pi', 'load-provider', async () => {
        const module = await import('@/pi/runPi')
        return module.runPi
    })

    await measureInternalSessionPhase('pi', 'run-provider', async () => {
        await runPi({
            startedBy: options.startedBy,
            vibySessionId: options.vibySessionId,
            ...withDriverSwitchBootstrap(options),
            permissionMode: resolvePermissionModeForAgent('pi', options.permissionMode) as PiPermissionMode | undefined,
            model: options.model,
            modelReasoningEffort: options.modelReasoningEffort,
            resumeSessionId: options.resumeSessionId,
        })
    })
}

export async function runInternalSessionRuntime(options: InternalSessionOptions): Promise<void> {
    const driverSwitchBootstrap = withDriverSwitchBootstrap(options)
    const sessionContinuityHandoff = asDriverSwitchHandoff(options.driverSwitch)

    switch (options.agent) {
        case 'claude': {
            const runClaude = await measureInternalSessionPhase('claude', 'load-provider', loadClaudeProvider)
            await measureInternalSessionPhase('claude', 'run-provider', async () => {
                await runClaude({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('claude', options.permissionMode) as
                        | ClaudePermissionMode
                        | undefined,
                    model: options.model,
                    modelReasoningEffort: resolveClaudeReasoningEffort(options.modelReasoningEffort),
                    claudeArgs: options.resumeSessionId ? ['--resume', options.resumeSessionId] : undefined,
                    sessionContinuityHandoff,
                })
            })
            return
        }
        case 'codex': {
            const runCodex = await measureInternalSessionPhase('codex', 'load-provider', loadCodexProvider)
            await measureInternalSessionPhase('codex', 'run-provider', async () => {
                await runCodex({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('codex', options.permissionMode) as
                        | CodexPermissionMode
                        | undefined,
                    resumeSessionId: options.resumeSessionId,
                    model: options.model,
                    modelReasoningEffort: resolveCodexReasoningEffort(options.modelReasoningEffort),
                    codexServiceTier: options.codexServiceTier,
                    collaborationMode: resolveCollaborationMode('codex', options.collaborationMode),
                    sessionContinuityHandoff,
                })
            })
            return
        }
        case 'cursor': {
            const runCursor = await measureInternalSessionPhase('cursor', 'load-provider', loadCursorProvider)
            await measureInternalSessionPhase('cursor', 'run-provider', async () => {
                await runCursor({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('cursor', options.permissionMode) as
                        | CursorPermissionMode
                        | undefined,
                    resumeSessionId: options.resumeSessionId,
                    model: options.model,
                    sessionContinuityHandoff,
                })
            })
            return
        }
        case 'gemini': {
            const runGemini = await measureInternalSessionPhase('gemini', 'load-provider', loadGeminiProvider)
            await measureInternalSessionPhase('gemini', 'run-provider', async () => {
                await runGemini({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('gemini', options.permissionMode) as
                        | GeminiPermissionMode
                        | undefined,
                    resumeSessionId: options.resumeSessionId,
                    model: options.model,
                    sessionContinuityHandoff,
                })
            })
            return
        }
        case 'opencode': {
            const runOpencode = await measureInternalSessionPhase('opencode', 'load-provider', loadOpencodeProvider)
            await measureInternalSessionPhase('opencode', 'run-provider', async () => {
                await runOpencode({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('opencode', options.permissionMode) as
                        | OpencodePermissionMode
                        | undefined,
                    resumeSessionId: options.resumeSessionId,
                    sessionContinuityHandoff,
                })
            })
            return
        }
        case 'pi': {
            await runInternalPi(options)
            return
        }
        case 'copilot': {
            const runCopilot = await measureInternalSessionPhase('copilot', 'load-provider', loadCopilotProvider)
            await measureInternalSessionPhase('copilot', 'run-provider', async () => {
                await runCopilot({
                    startedBy: options.startedBy,
                    vibySessionId: options.vibySessionId,
                    ...driverSwitchBootstrap,
                    permissionMode: resolvePermissionModeForAgent('copilot', options.permissionMode) as
                        | CopilotPermissionMode
                        | undefined,
                    resumeSessionId: options.resumeSessionId,
                    model: options.model,
                    sessionContinuityHandoff,
                })
            })
            return
        }
    }
}
