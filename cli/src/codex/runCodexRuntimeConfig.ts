import { isPermissionModeAllowedForDriver } from '@viby/protocol'
import type { CodexReasoningEffort } from '@viby/protocol/types'
import { logger } from '@/ui/logger'
import type { EnhancedMode, PermissionMode } from './loop'
import type { CodexSession } from './session'

export type CodexRuntimeConfig = {
    permissionMode: PermissionMode
    model: string | undefined
    modelReasoningEffort: CodexReasoningEffort | null
    collaborationMode: EnhancedMode['collaborationMode']
}

export function createCodexRuntimeConfig(args: {
    permissionMode?: PermissionMode
    model?: string
    modelReasoningEffort?: CodexReasoningEffort | null
    collaborationMode?: EnhancedMode['collaborationMode']
}): CodexRuntimeConfig {
    return {
        permissionMode: args.permissionMode ?? 'default',
        model: args.model,
        modelReasoningEffort: args.modelReasoningEffort ?? null,
        collaborationMode: args.collaborationMode ?? 'default',
    }
}

export function applyRuntimeConfigToSession(config: CodexRuntimeConfig, session: CodexSession): CodexRuntimeConfig {
    const effectiveModel = resolveEffectiveRuntimeModel(config, session)
    session.setPermissionMode(config.permissionMode)
    session.setModel(effectiveModel)
    session.setModelReasoningEffort(config.modelReasoningEffort)
    session.setCollaborationMode(config.collaborationMode)
    logger.debug(
        `[Codex] Synced session config for keepalive: ` +
            `permissionMode=${config.permissionMode}, model=${effectiveModel ?? 'auto'}, ` +
            `reasoningEffort=${config.modelReasoningEffort ?? 'auto'}, collaborationMode=${config.collaborationMode}`
    )
    return {
        ...config,
        model: effectiveModel ?? undefined,
    }
}

export function syncRuntimeConfigFromSession(
    config: CodexRuntimeConfig,
    session: CodexSession | null
): CodexRuntimeConfig {
    if (!session) {
        return config
    }

    const nextPermissionMode = session.getPermissionMode()
    const permissionMode =
        nextPermissionMode && isPermissionModeAllowedForDriver(nextPermissionMode, 'codex')
            ? (nextPermissionMode as PermissionMode)
            : config.permissionMode
    const sessionModel = session.getModel()
    const sessionModelReasoningEffort = session.getModelReasoningEffort()
    const sessionCollaborationMode = session.getCollaborationMode()

    return {
        permissionMode,
        model: sessionModel !== undefined ? (sessionModel ?? undefined) : config.model,
        modelReasoningEffort:
            sessionModelReasoningEffort !== undefined
                ? (sessionModelReasoningEffort ?? null)
                : config.modelReasoningEffort,
        collaborationMode: sessionCollaborationMode ?? config.collaborationMode,
    }
}

export function createQueuedCodexMode(config: CodexRuntimeConfig, developerInstructions?: string): EnhancedMode {
    return {
        permissionMode: config.permissionMode,
        model: config.model,
        modelReasoningEffort: config.modelReasoningEffort,
        collaborationMode: config.collaborationMode,
        developerInstructions,
    }
}

function resolveEffectiveRuntimeModel(config: CodexRuntimeConfig, session: CodexSession): string | null {
    const sessionModel = session.getModel()
    if (config.model === undefined && typeof sessionModel === 'string' && sessionModel.length > 0) {
        return sessionModel
    }
    return config.model ?? sessionModel ?? null
}
