const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])
const PRIVATE_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'] as const

function normalizeHostname(hostname: string): string {
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1)
    }
    return hostname
}

function parseOrigin(origin: string): URL | null {
    try {
        return new URL(origin)
    } catch {
        return null
    }
}

export function isLoopbackOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed) {
        return false
    }

    return LOOPBACK_HOSTS.has(normalizeHostname(parsed.hostname))
}

function isPrivateIpv4Hostname(hostname: string): boolean {
    const parts = hostname.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false
    }

    const [a, b] = parts
    return a === 10
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || (a === 169 && b === 254)
        || (a === 100 && b >= 64 && b <= 127)
}

function isPrivateIpv6Hostname(hostname: string): boolean {
    const normalized = hostname.toLowerCase()
    return PRIVATE_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function isLocalNetworkOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed) {
        return false
    }

    const hostname = normalizeHostname(parsed.hostname)
    if (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.local')) {
        return true
    }

    return isPrivateIpv4Hostname(hostname) || isPrivateIpv6Hostname(hostname)
}

export function shouldRegisterServiceWorkerForOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed || parsed.protocol !== 'https:') {
        return false
    }

    return !isLocalNetworkOrigin(origin)
}
