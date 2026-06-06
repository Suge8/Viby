import type { AgentLaunchConfig, PiModelCapability } from '@viby/protocol/types'
import { fromPiThinkingLevel, type PiThinkingLevel } from './messageCodec'
import { PiRpcClient, type PiRpcModel, resolvePiExecutable } from './piRpcClient'

type PiAgentLaunchConfig = AgentLaunchConfig & { agent: 'pi' }

const PI_SUPPORTED_REASONING_LEVELS: PiModelCapability['supportedThinkingLevels'] = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
]

function normalizePiLabel(model: PiRpcModel): string {
    return model.name?.trim() || formatPiModel(model) || model.id
}

function disambiguateDuplicatePiLabels(capabilities: PiModelCapability[]): PiModelCapability[] {
    const labelCounts = new Map<string, number>()
    for (const capability of capabilities) {
        labelCounts.set(capability.label, (labelCounts.get(capability.label) ?? 0) + 1)
    }

    return capabilities.map((capability) => {
        if ((labelCounts.get(capability.label) ?? 0) < 2) {
            return capability
        }
        return { ...capability, label: `${capability.label} (${capability.id.split('/')[0]})` }
    })
}

export function normalizePiModelSelection(value: string | undefined): string | undefined {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return undefined
    }
    return trimmed
}

export function formatPiModel(model: Pick<PiRpcModel, 'provider' | 'id'> | null | undefined): string | null {
    return model ? `${model.provider}/${model.id}` : null
}

export function buildPiModelFromSelection(model: string | null | undefined): PiRpcModel | undefined {
    const normalizedModel = normalizePiModelSelection(model ?? undefined)
    if (!normalizedModel) {
        return undefined
    }

    const separatorIndex = normalizedModel.indexOf('/')
    if (separatorIndex <= 0 || separatorIndex >= normalizedModel.length - 1) {
        return undefined
    }

    return {
        provider: normalizedModel.slice(0, separatorIndex),
        id: normalizedModel.slice(separatorIndex + 1),
        name: normalizedModel,
        reasoning: true,
    }
}

export function resolvePiRuntimeModel(
    selectableModels: readonly PiRpcModel[],
    requestedModel: string | null | undefined,
    defaultModel: PiRpcModel | null | undefined
): PiRpcModel | undefined {
    const normalizedRequestedModel = normalizePiModelSelection(requestedModel ?? undefined)
    if (!normalizedRequestedModel) {
        return defaultModel ?? undefined
    }

    const lowerRequestedModel = normalizedRequestedModel.toLowerCase()
    const modelMatches = (model: PiRpcModel | null | undefined): model is PiRpcModel => {
        if (!model) {
            return false
        }
        const qualifiedId = formatPiModel(model)?.toLowerCase()
        return qualifiedId === lowerRequestedModel || model.id.toLowerCase() === lowerRequestedModel
    }

    const resolvedModel = selectableModels.find(modelMatches)
    if (resolvedModel) {
        return resolvedModel
    }
    if (modelMatches(defaultModel)) {
        return defaultModel ?? undefined
    }
    if (selectableModels.length === 0) {
        return buildPiModelFromSelection(normalizedRequestedModel)
    }

    throw new Error(`Pi model not found in local Pi runtime: ${normalizedRequestedModel}`)
}

export function resolvePiModel(
    selectableModels: readonly PiRpcModel[],
    requestedModel: string | undefined
): PiRpcModel | undefined {
    const normalizedRequestedModel = normalizePiModelSelection(requestedModel)
    if (!normalizedRequestedModel) {
        return undefined
    }

    const lowerRequestedModel = normalizedRequestedModel.toLowerCase()
    const resolvedModel = selectableModels.find((candidate) => {
        const qualifiedId = formatPiModel(candidate)?.toLowerCase()
        return qualifiedId === lowerRequestedModel || candidate.id.toLowerCase() === lowerRequestedModel
    })

    if (!resolvedModel) {
        throw new Error(`Pi model not found in local Pi runtime: ${normalizedRequestedModel}`)
    }

    return resolvedModel
}

function orderPiReasoning(
    preferred: string | null | undefined,
    supportedThinkingLevels: PiModelCapability['supportedThinkingLevels']
): PiModelCapability['supportedThinkingLevels'] {
    if (!preferred || !supportedThinkingLevels.includes(preferred as never)) return supportedThinkingLevels
    return [...new Set([preferred as PiModelCapability['supportedThinkingLevels'][number], ...supportedThinkingLevels])]
}

export function toPiModelCapabilities(
    models: readonly PiRpcModel[],
    preferredModel?: PiRpcModel | null,
    preferredReasoning?: string | null
): PiModelCapability[] {
    const preferredId = formatPiModel(preferredModel)
    const orderedModels = preferredId
        ? [
              ...models.filter((model) => formatPiModel(model) === preferredId),
              ...models.filter((model) => formatPiModel(model) !== preferredId),
          ]
        : models
    const capabilities: PiModelCapability[] = orderedModels.map((model) => {
        const supportedThinkingLevels: PiModelCapability['supportedThinkingLevels'] =
            model.reasoning === false ? ['none'] : [...PI_SUPPORTED_REASONING_LEVELS]
        return {
            id: formatPiModel(model) ?? model.id,
            label: normalizePiLabel(model),
            supportedThinkingLevels: orderPiReasoning(preferredReasoning, supportedThinkingLevels),
        }
    })
    return disambiguateDuplicatePiLabels(capabilities)
}

export async function resolvePiAgentLaunchConfig(workingDirectory: string): Promise<PiAgentLaunchConfig> {
    const client = new PiRpcClient({ cwd: workingDirectory, command: resolvePiExecutable() })
    await client.start()
    try {
        const [models, state] = await Promise.all([client.getAvailableModels(), client.getState()])
        return {
            agent: 'pi',
            availableModels: toPiModelCapabilities(
                models,
                state.model,
                fromPiThinkingLevel(state.thinkingLevel as PiThinkingLevel | undefined)
            ),
        }
    } finally {
        await client.stop()
    }
}
