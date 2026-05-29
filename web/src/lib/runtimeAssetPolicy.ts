const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'])
const TRUSTWORTHY_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const PRIVATE_IPV6_PREFIXES = ['fc', 'fd', 'fe8', 'fe9', 'fea', 'feb'] as const

function normalizeHostname(hostname: string): string {
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1)
    }
    return hostname.toLowerCase()
}

function parseOrigin(origin: string): URL | null {
    try {
        return new URL(origin)
    } catch {
        return null
    }
}

function isLoopbackHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname)
    return LOOPBACK_HOSTS.has(normalized) || normalized.endsWith('.localhost')
}

function isTrustworthyLoopbackHostname(hostname: string): boolean {
    const normalized = normalizeHostname(hostname)
    return TRUSTWORTHY_LOOPBACK_HOSTS.has(normalized) || normalized.endsWith('.localhost')
}

export function isLoopbackOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    return parsed ? isLoopbackHostname(parsed.hostname) : false
}

function isPrivateIpv4Hostname(hostname: string): boolean {
    const parts = hostname.split('.').map((part) => Number.parseInt(part, 10))
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
        return false
    }

    const [a, b] = parts
    return (
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127)
    )
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
    if (isLoopbackHostname(hostname) || hostname.endsWith('.local')) {
        return true
    }

    return isPrivateIpv4Hostname(hostname) || isPrivateIpv6Hostname(hostname)
}

export function isPotentiallyTrustworthyWebOrigin(origin: string): boolean {
    const parsed = parseOrigin(origin)
    if (!parsed) {
        return false
    }

    if (parsed.protocol === 'https:') {
        return true
    }

    return parsed.protocol === 'http:' && isTrustworthyLoopbackHostname(parsed.hostname)
}

export function isPairingBootServiceWorkerBypassPath(pathname: string): boolean {
    return pathname.startsWith('/p/')
}

export function shouldRegisterServiceWorkerForOrigin(origin: string): boolean {
    return isPotentiallyTrustworthyWebOrigin(origin)
}

export function shouldRegisterServiceWorkerForLocation(origin: string, pathname: string): boolean {
    return shouldRegisterServiceWorkerForOrigin(origin) && !isPairingBootServiceWorkerBypassPath(pathname)
}
