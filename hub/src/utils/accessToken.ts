export function parseAccessToken(raw: string): string | null {
    if (!raw) {
        return null
    }

    const trimmed = raw.trim()
    if (!trimmed) {
        return null
    }

    if (trimmed.includes(':')) {
        return null
    }

    return trimmed
}
