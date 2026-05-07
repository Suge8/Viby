import { type NetworkInterfaceInfo, networkInterfaces } from 'node:os'
import type { ConfigSource } from './configuration'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::', '::1'])
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::'])
const DESKTOP_LOOPBACK_ORIGINS = [
    'http://127.0.0.1:1420',
    'http://localhost:1420',
    'http://[::1]:1420',
    'tauri://localhost',
    'https://tauri.localhost',
] as const

export function formatSource(source: ConfigSource | 'generated'): string {
    switch (source) {
        case 'env':
            return 'environment'
        case 'file':
            return 'settings.toml'
        case 'default':
            return 'default'
        case 'generated':
            return 'generated'
    }
}

export function normalizeOrigin(value: string): string {
    const trimmed = value.trim()
    if (!trimmed) {
        return ''
    }

    try {
        const origin = new URL(trimmed).origin
        return origin === 'null' && trimmed !== 'null' ? trimmed : origin
    } catch {
        return trimmed
    }
}

function normalizeHostname(hostname: string): string {
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
        return hostname.slice(1, -1)
    }
    return hostname
}

export function isLoopbackHost(hostname: string): boolean {
    return LOOPBACK_HOSTS.has(normalizeHostname(hostname))
}

export function isLoopbackOrigin(value: string): boolean {
    try {
        return isLoopbackHost(new URL(value).hostname)
    } catch {
        return false
    }
}

export function normalizeOrigins(origins: string[]): string[] {
    const normalized = origins.map(normalizeOrigin).filter(Boolean)
    if (normalized.includes('*')) {
        return ['*']
    }
    return Array.from(new Set(normalized))
}

export function mergeCorsOrigins(base: string[], extra: string[]): string[] {
    if (base.includes('*') || extra.includes('*')) {
        return ['*']
    }

    const merged = new Set<string>()
    for (const origin of base) {
        merged.add(origin)
    }
    for (const origin of extra) {
        merged.add(origin)
    }
    return Array.from(merged)
}

function formatApiHost(host: string): string {
    if (host.includes(':') && !host.startsWith('[')) {
        return `[${host}]`
    }
    return host
}

export function resolveLocalApiUrl(listenHost: string, listenPort: number): string {
    const host = listenHost === '0.0.0.0' || listenHost === '::' ? '127.0.0.1' : listenHost
    return `http://${formatApiHost(host)}:${listenPort}`
}

export function resolveWildcardPublicHost(
    interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()
): string | null {
    for (const entries of Object.values(interfaces)) {
        const address = entries?.find((entry) => entry.family === 'IPv4' && !entry.internal)?.address
        if (address) {
            return address
        }
    }

    return null
}

export function resolveDefaultPublicApiUrl(listenHost: string, listenPort: number): string {
    const normalizedHost = normalizeHostname(listenHost)
    const host = WILDCARD_HOSTS.has(normalizedHost) ? resolveWildcardPublicHost() : normalizedHost
    return host ? `http://${formatApiHost(host)}:${listenPort}` : resolveLocalApiUrl(listenHost, listenPort)
}

export function buildLocalOriginAliases(listenHost: string, listenPort: number): string[] {
    if (!isLoopbackHost(listenHost)) {
        return [resolveLocalApiUrl(listenHost, listenPort)]
    }

    return normalizeOrigins([
        resolveLocalApiUrl(listenHost, listenPort),
        `http://localhost:${listenPort}`,
        `http://127.0.0.1:${listenPort}`,
        `http://[::1]:${listenPort}`,
        ...DESKTOP_LOOPBACK_ORIGINS,
    ])
}

export function buildStartupMessage(): string {
    return '本地中枢启动中。'
}

export function buildConnectingMessage(): string {
    return '本地中枢已启动，正在连接这台机器。'
}

export function formatManagedMachineExit(code: number | null, signal: NodeJS.Signals | null): string {
    const codePart = code === null ? 'unknown' : String(code)
    const signalPart = signal ?? 'none'
    return `这台机器与中枢的连接异常退出了（code=${codePart}, signal=${signalPart}）。`
}
