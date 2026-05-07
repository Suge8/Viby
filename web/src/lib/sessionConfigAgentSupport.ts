import type { AgentModelCapability } from '@viby/protocol'

function normalizeComposerStringValue(value?: string | null): string | null {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return null
    }

    return trimmed
}

export function normalizeAgentModelCapabilities(
    capabilities?: readonly AgentModelCapability[] | null
): AgentModelCapability[] {
    if (!capabilities || capabilities.length === 0) {
        return []
    }

    const seen = new Set<string>()
    const normalized: AgentModelCapability[] = []
    for (const capability of capabilities) {
        const id = capability.id.trim()
        if (!id || seen.has(id)) {
            continue
        }

        seen.add(id)
        normalized.push({
            ...capability,
            id,
            label: capability.label.trim() || id,
            supportedThinkingLevels: capability.supportedThinkingLevels,
        })
    }

    return normalized
}

export function findAgentModelCapability(
    currentModel?: string | null,
    capabilities?: readonly AgentModelCapability[] | null
): AgentModelCapability | null {
    const normalizedCapabilities = normalizeAgentModelCapabilities(capabilities)
    const normalizedModel = normalizeComposerStringValue(currentModel)
    if (!normalizedModel) {
        return null
    }

    return normalizedCapabilities.find((capability) => capability.id === normalizedModel) ?? null
}
