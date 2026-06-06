import type { ModelReasoningEffort, RuntimeAgentCapabilitySnapshot } from '@viby/protocol'
import type { DesktopCopy } from './desktopCopy'

const MAX_MODEL_LABELS = 3
type LaunchConfig = NonNullable<RuntimeAgentCapabilitySnapshot['launchConfig']['config']>

function formatModelList(config: LaunchConfig): string | null {
    if (config.availableModels.length === 0) return null
    const labels = config.availableModels.slice(0, MAX_MODEL_LABELS).map((model) => model.label || model.id)
    const extra = config.availableModels.length - labels.length
    return extra > 0 ? `${labels.join(', ')} +${extra}` : labels.join(', ')
}

function collectThinkingLevels(config: LaunchConfig): ModelReasoningEffort[] {
    const levels = new Set<ModelReasoningEffort>()
    for (const candidate of config.availableModels) {
        for (const level of candidate.supportedThinkingLevels) {
            if (level !== 'none') levels.add(level)
        }
    }
    return [...levels]
}

export function getAgentCapabilitySummary(
    copy: DesktopCopy,
    capability: RuntimeAgentCapabilitySnapshot | null
): string | null {
    const config = capability?.launchConfig.config
    if (!config) return null

    const modelList = formatModelList(config)
    const levels = collectThinkingLevels(config)
    if (!modelList && levels.length === 0) return null

    const recommendedModel =
        config.availableModels[0]?.label || config.availableModels[0]?.id || copy.agentDefaultModelAuto
    const parts = [`${copy.agentDefaultModelLabel}: ${recommendedModel}`]
    if (modelList) parts.push(`${copy.agentModelsLabel}: ${modelList}`)
    if (levels.length > 0) parts.push(`${copy.agentThinkingLabel}: ${levels.join('/')}`)
    return parts.join(' · ')
}
