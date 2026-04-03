import { dirname, join } from 'node:path'
import { existsSync } from 'node:fs'

import type { AgentLaunchConfig, PiModelCapability } from '@viby/protocol/types'
import { formatPiModel, fromPiThinkingLevel, type PiThinkingLevel } from './messageCodec'
import { formatPiScopedModelId, resolvePiModelScope, type PiScopedModelSelection } from './modelScope'

type PiSdkModule = typeof import('@mariozechner/pi-coding-agent')
type PiSdkSession = Awaited<ReturnType<PiSdkModule['createAgentSession']>>['session']
type PiSdkModel = NonNullable<PiSdkSession['model']>

type PiAgentLaunchConfig = AgentLaunchConfig & { agent: 'pi' }

type PiScopedModelContext = {
    scopedModelSelections: PiScopedModelSelection[]
    scopedPiModels: Array<{ model: PiSdkModel; thinkingLevel?: PiThinkingLevel }>
    effectiveSelectablePiModels: PiSdkModel[]
    piModelCapabilities: PiModelCapability[]
    scopeEnabled: boolean
}

const PI_SUPPORTED_REASONING_LEVELS: PiModelCapability['supportedThinkingLevels'] = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh'
]

function toPiCapabilityDefaultThinkingLevel(
    thinkingLevel: PiThinkingLevel | undefined
): PiModelCapability['defaultThinkingLevel'] | undefined {
    const normalizedLevel = fromPiThinkingLevel(thinkingLevel)
    return normalizedLevel && normalizedLevel !== 'max'
        ? normalizedLevel
        : undefined
}

function resolveExistingDirectory(path: string): string {
    let currentPath = path.trim()
    if (!currentPath) {
        return process.cwd()
    }

    while (!existsSync(currentPath)) {
        const parentPath = dirname(currentPath)
        if (parentPath === currentPath) {
            return process.cwd()
        }
        currentPath = parentPath
    }

    return currentPath
}

export function normalizePiModelSelection(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }

    const trimmed = value.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return undefined
    }

    return trimmed
}

export function resolvePiModel(
    selectableModels: readonly PiSdkModel[],
    requestedModel: string | undefined
): PiSdkModel | undefined {
    const normalizedRequestedModel = normalizePiModelSelection(requestedModel)
    if (!normalizedRequestedModel) {
        return undefined
    }

    const lowerRequestedModel = normalizedRequestedModel.toLowerCase()
    const resolvedModel = selectableModels.find((candidate: PiSdkModel) => {
        const qualifiedId = `${candidate.provider}/${candidate.id}`.toLowerCase()
        return qualifiedId === lowerRequestedModel || candidate.id.toLowerCase() === lowerRequestedModel
    })

    if (!resolvedModel) {
        throw new Error(`Pi model not found in the current Pi scope: ${normalizedRequestedModel}`)
    }

    return resolvedModel
}

export function toPiScopedModels(
    scopedModels: readonly PiScopedModelSelection[],
    selectableModels: readonly PiSdkModel[]
): Array<{ model: PiSdkModel; thinkingLevel?: PiThinkingLevel }> {
    return scopedModels.flatMap((selection) => {
        const match = selectableModels.find((candidate) => (
            candidate.provider === selection.model.provider && candidate.id === selection.model.id
        ))
        if (!match) {
            return []
        }

        return [{
            model: match,
            thinkingLevel: selection.thinkingLevel as PiThinkingLevel | undefined
        }]
    })
}

export function toPiModelCapabilities(
    scopedModels: readonly PiScopedModelSelection[]
): PiModelCapability[] {
    return scopedModels.map((selection) => ({
        id: formatPiScopedModelId(selection.model),
        label: selection.model.name?.trim() || formatPiScopedModelId(selection.model),
        supportedThinkingLevels: selection.model.reasoning === false
            ? ['none']
            : [...PI_SUPPORTED_REASONING_LEVELS],
        ...(selection.thinkingLevel
            ? { defaultThinkingLevel: toPiCapabilityDefaultThinkingLevel(selection.thinkingLevel) }
            : {})
    }))
}

export function resolvePiScopedModelContext(
    selectableModels: readonly PiSdkModel[],
    enabledModelPatterns: readonly string[] | undefined
): PiScopedModelContext {
    const scopedModelSelections = resolvePiModelScope(enabledModelPatterns, selectableModels)
    const scopeEnabled = Array.isArray(enabledModelPatterns) && enabledModelPatterns.length > 0
    const scopedPiModels = toPiScopedModels(scopedModelSelections, selectableModels)
    const effectiveSelectablePiModels = scopeEnabled
        ? scopedPiModels.map((item) => item.model)
        : [...selectableModels]
    const piModelCapabilities = toPiModelCapabilities(
        scopeEnabled
            ? scopedModelSelections
            : selectableModels.map((model) => ({ model }))
    )

    return {
        scopedModelSelections,
        scopedPiModels,
        effectiveSelectablePiModels,
        piModelCapabilities,
        scopeEnabled
    }
}

export async function resolvePiAgentLaunchConfig(workingDirectory: string): Promise<PiAgentLaunchConfig> {
    const piSdk = await import('@mariozechner/pi-coding-agent') as PiSdkModule
    const resolvedWorkingDirectory = resolveExistingDirectory(workingDirectory)
    const agentDir = piSdk.getAgentDir()
    const authStorage = piSdk.AuthStorage.create(join(agentDir, 'auth.json'))
    const modelRegistry = piSdk.ModelRegistry.create(authStorage, join(agentDir, 'models.json'))
    const settingsManager = piSdk.SettingsManager.create(resolvedWorkingDirectory, agentDir)
    const sessionManager = piSdk.SessionManager.inMemory(resolvedWorkingDirectory)
    const selectableModels = modelRegistry.getAvailable()
    const enabledModelPatterns = settingsManager.getEnabledModels()
    const scopedContext = resolvePiScopedModelContext(selectableModels, enabledModelPatterns)

    if (scopedContext.effectiveSelectablePiModels.length === 0) {
        return {
            agent: 'pi',
            defaultModel: null,
            defaultModelReasoningEffort: null,
            availableModels: scopedContext.piModelCapabilities
        }
    }

    const { session } = await piSdk.createAgentSession({
        cwd: resolvedWorkingDirectory,
        agentDir,
        authStorage,
        modelRegistry,
        settingsManager,
        sessionManager,
        scopedModels: scopedContext.scopeEnabled ? scopedContext.scopedPiModels : undefined
    })

    try {
        return {
            agent: 'pi',
            defaultModel: formatPiModel(session.model),
            defaultModelReasoningEffort: fromPiThinkingLevel(session.thinkingLevel as PiThinkingLevel | undefined),
            availableModels: scopedContext.piModelCapabilities
        }
    } finally {
        session.dispose()
    }
}
