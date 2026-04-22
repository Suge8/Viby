// Deep equality helper for comparing tool arguments
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a == null || b == null) return false
    if (typeof a !== 'object' || typeof b !== 'object') return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    for (const key of keysA) {
        if (!keysB.includes(key)) return false
        const left = (a as Record<string, unknown>)[key]
        const right = (b as Record<string, unknown>)[key]
        if (!deepEqual(left, right)) return false
    }

    return true
}
