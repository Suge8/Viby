function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function isInternalEventJson(text: string): boolean {
    if (text[0] !== '{') return false

    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch {
        return false
    }

    const record = asRecord(parsed)
    const data = record?.type === 'output' ? asRecord(record.data) : null
    if (!data) return false

    const hasParentUuid = typeof data.parentUuid === 'string' || data.parentUuid === null
    return hasParentUuid && typeof data.sessionId === 'string' && typeof data.userType === 'string'
}
