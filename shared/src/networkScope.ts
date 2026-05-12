const LOCAL_HOST_SUFFIXES = ['.localhost', '.local'] as const

function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function isLoopbackIpv4(hostname: string): boolean {
    const parts = hostname.split('.').map(Number)
    return parts.length === 4 && parts.every((part) => Number.isInteger(part)) && parts[0] === 127
}

function isUnspecifiedHostname(hostname: string): boolean {
    return hostname === '0.0.0.0' || hostname === '::'
}

export function isLoopbackHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname)
    return (
        normalized === 'localhost' ||
        normalized === '::1' ||
        normalized === '0:0:0:0:0:0:0:1' ||
        isLoopbackIpv4(normalized)
    )
}

export function isPrivateIpv4(hostname: string): boolean {
    const parts = hostname.split('.').map(Number)
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
    const [a, b] = parts
    return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
    )
}

export function isLocalNetworkHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname)
    if (isLoopbackHostname(normalized)) return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) return true
    return isPrivateIpv4(normalized) || LOCAL_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

export function isLocalNetworkHostnameOrMissing(hostname: string | null | undefined): boolean {
    return !hostname || isLocalNetworkHostname(hostname)
}

export function isLocalNetworkUrl(value: string): boolean {
    try {
        return isLocalNetworkHostname(new URL(value).hostname)
    } catch {
        return false
    }
}

export function isReachableLocalNetworkUrl(value: string): boolean {
    try {
        const parsed = new URL(value)
        const hostname = normalizeHostname(parsed.hostname)
        return isLocalNetworkHostname(hostname) && !isLoopbackHostname(hostname) && !isUnspecifiedHostname(hostname)
    } catch {
        return false
    }
}
