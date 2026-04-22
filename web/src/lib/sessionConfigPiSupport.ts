import type { PiModelCapability } from '@viby/protocol'

function normalizeComposerStringValue(value?: string | null): string | null {
    const trimmed = value?.trim()
    if (!trimmed || trimmed === 'auto' || trimmed === 'default') {
        return null
    }

    return trimmed
}

export function normalizePiModelCapabilities(capabilities?: readonly PiModelCapability[] | null): PiModelCapability[] {
    if (!capabilities || capabilities.length === 0) {
        return []
    }

    const seen = new Set<string>()
    const normalized: PiModelCapability[] = []
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

export function findPiModelCapability(
    currentModel?: string | null,
    capabilities?: readonly PiModelCapability[] | null
): PiModelCapability | null {
    const normalizedCapabilities = normalizePiModelCapabilities(capabilities)
    const normalizedModel = normalizeComposerStringValue(currentModel)
    if (!normalizedModel) {
        return null
    }

    return normalizedCapabilities.find((capability) => capability.id === normalizedModel) ?? null
}
