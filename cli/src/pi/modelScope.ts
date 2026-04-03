import { minimatch } from 'minimatch'

export type PiScopedThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type PiScopedModel = {
    provider: string
    id: string
    name?: string | null
    reasoning?: boolean
}

export type PiScopedModelSelection = {
    model: PiScopedModel
    thinkingLevel?: PiScopedThinkingLevel
}

const PI_THINKING_LEVELS = new Set<PiScopedThinkingLevel>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])

function isPiAlias(id: string): boolean {
    if (id.endsWith('-latest')) {
        return true
    }

    return !/-\d{8}$/.test(id)
}

function isValidPiThinkingLevel(value: string): value is PiScopedThinkingLevel {
    return PI_THINKING_LEVELS.has(value as PiScopedThinkingLevel)
}

function canonicalPiModelId(model: Pick<PiScopedModel, 'provider' | 'id'>): string {
    return `${model.provider}/${model.id}`.toLowerCase()
}

function findExactPiModelReferenceMatch(
    modelReference: string,
    availableModels: readonly PiScopedModel[]
): PiScopedModel | undefined {
    const trimmedReference = modelReference.trim()
    if (!trimmedReference) {
        return undefined
    }

    const normalizedReference = trimmedReference.toLowerCase()
    const canonicalMatches = availableModels.filter((model) => canonicalPiModelId(model) === normalizedReference)
    if (canonicalMatches.length === 1) {
        return canonicalMatches[0]
    }
    if (canonicalMatches.length > 1) {
        return undefined
    }

    const slashIndex = trimmedReference.indexOf('/')
    if (slashIndex !== -1) {
        const provider = trimmedReference.slice(0, slashIndex).trim()
        const modelId = trimmedReference.slice(slashIndex + 1).trim()
        if (provider && modelId) {
            const providerMatches = availableModels.filter((model) => (
                model.provider.toLowerCase() === provider.toLowerCase()
                && model.id.toLowerCase() === modelId.toLowerCase()
            ))
            if (providerMatches.length === 1) {
                return providerMatches[0]
            }
            if (providerMatches.length > 1) {
                return undefined
            }
        }
    }

    const idMatches = availableModels.filter((model) => model.id.toLowerCase() === normalizedReference)
    return idMatches.length === 1 ? idMatches[0] : undefined
}

function tryMatchPiModel(
    modelPattern: string,
    availableModels: readonly PiScopedModel[]
): PiScopedModel | undefined {
    const exactMatch = findExactPiModelReferenceMatch(modelPattern, availableModels)
    if (exactMatch) {
        return exactMatch
    }

    const matches = availableModels.filter((model) => (
        model.id.toLowerCase().includes(modelPattern.toLowerCase())
        || model.name?.toLowerCase().includes(modelPattern.toLowerCase())
    ))
    if (matches.length === 0) {
        return undefined
    }

    const aliases = matches.filter((model) => isPiAlias(model.id))
    if (aliases.length > 0) {
        aliases.sort((left, right) => right.id.localeCompare(left.id))
        return aliases[0]
    }

    const datedVersions = [...matches].sort((left, right) => right.id.localeCompare(left.id))
    return datedVersions[0]
}

function parsePiModelPattern(
    pattern: string,
    availableModels: readonly PiScopedModel[]
): { model?: PiScopedModel; thinkingLevel?: PiScopedThinkingLevel } {
    const exactMatch = tryMatchPiModel(pattern, availableModels)
    if (exactMatch) {
        return { model: exactMatch }
    }

    const lastColonIndex = pattern.lastIndexOf(':')
    if (lastColonIndex === -1) {
        return {}
    }

    const prefix = pattern.slice(0, lastColonIndex)
    const suffix = pattern.slice(lastColonIndex + 1)
    if (isValidPiThinkingLevel(suffix)) {
        const result = parsePiModelPattern(prefix, availableModels)
        if (result.model) {
            return {
                model: result.model,
                thinkingLevel: result.thinkingLevel ?? suffix
            }
        }
        return result
    }

    return parsePiModelPattern(prefix, availableModels)
}

export function resolvePiModelScope(
    patterns: readonly string[] | undefined,
    availableModels: readonly PiScopedModel[]
): PiScopedModelSelection[] {
    if (!patterns || patterns.length === 0) {
        return availableModels.map((model) => ({ model }))
    }

    const scopedModels: PiScopedModelSelection[] = []
    const positionsByKey = new Map<string, number>()
    for (const pattern of patterns) {
        if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
            const colonIndex = pattern.lastIndexOf(':')
            let globPattern = pattern
            let thinkingLevel: PiScopedThinkingLevel | undefined
            if (colonIndex !== -1) {
                const suffix = pattern.slice(colonIndex + 1)
                if (isValidPiThinkingLevel(suffix)) {
                    thinkingLevel = suffix
                    globPattern = pattern.slice(0, colonIndex)
                }
            }

            const matchingModels = availableModels.filter((model) => (
                minimatch(`${model.provider}/${model.id}`, globPattern, { nocase: true })
                || minimatch(model.id, globPattern, { nocase: true })
            ))

            for (const model of matchingModels) {
                upsertScopedModelSelection(scopedModels, positionsByKey, {
                    model,
                    thinkingLevel
                })
            }
            continue
        }

        const selection = parsePiModelPattern(pattern, availableModels)
        if (!selection.model) {
            continue
        }

        const resolvedSelection: PiScopedModelSelection = {
            model: selection.model,
            ...(selection.thinkingLevel ? { thinkingLevel: selection.thinkingLevel } : {})
        }
        upsertScopedModelSelection(scopedModels, positionsByKey, resolvedSelection)
    }

    return scopedModels
}

export function formatPiScopedModelId(model: Pick<PiScopedModel, 'provider' | 'id'>): string {
    return `${model.provider}/${model.id}`
}

function upsertScopedModelSelection(
    scopedModels: PiScopedModelSelection[],
    positionsByKey: Map<string, number>,
    selection: PiScopedModelSelection
): void {
    const key = canonicalPiModelId(selection.model)
    const existingIndex = positionsByKey.get(key)
    if (existingIndex === undefined) {
        positionsByKey.set(key, scopedModels.length)
        scopedModels.push(selection)
        return
    }

    scopedModels[existingIndex] = selection
}
