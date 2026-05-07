import { isObject } from '@viby/protocol'

export function extractTextContent(block: unknown): string | null {
    if (!isObject(block) || block.type !== 'text') return null
    const audiences = extractExplicitAudience(block.annotations)
    if (audiences.length > 0 && !audiences.includes('assistant')) return null
    return typeof block.text === 'string' ? block.text : null
}

export function mergeTextChunk(base: string, next: string): string {
    if (!base || next.startsWith(base)) return next
    if (next === base || base.startsWith(next) || base.endsWith(next)) return base
    if (next.endsWith(base)) return next

    const overlap = getSuffixPrefixOverlap(base, next)
    return overlap > 0 ? base + next.slice(overlap) : base + next
}

function extractExplicitAudience(annotations: unknown): string[] {
    if (Array.isArray(annotations)) return annotations.flatMap(extractAudienceAnnotation)
    if (!isObject(annotations)) return []
    return [
        ...extractAudienceField(annotations.audience),
        ...(isObject(annotations.value) ? extractAudienceField(annotations.value.audience) : []),
    ]
}

function extractAudienceAnnotation(entry: unknown): string[] {
    if (typeof entry === 'string') return [entry]
    if (!isObject(entry)) return []
    return [
        ...extractAudienceField(entry.audience),
        ...(isObject(entry.value) ? extractAudienceField(entry.value.audience) : []),
    ]
}

function extractAudienceField(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function getSuffixPrefixOverlap(base: string, next: string): number {
    const maxOverlap = Math.min(base.length, next.length)
    for (let length = maxOverlap; length > 0; length -= 1) {
        if (base.endsWith(next.slice(0, length))) return length
    }
    return 0
}
