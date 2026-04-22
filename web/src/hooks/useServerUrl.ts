import { useCallback, useMemo, useState } from 'react'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

const HUB_URL_KEY = LOCAL_STORAGE_KEYS.hubUrl
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

export type ServerUrlResult = { ok: true; value: string } | { ok: false; error: string }

export function normalizeServerUrl(input: string): ServerUrlResult {
    const trimmed = input.trim()
    if (!trimmed) {
        return { ok: false, error: 'Enter a hub URL like https://example.com' }
    }

    let parsed: URL
    try {
        parsed = new URL(trimmed)
    } catch {
        return { ok: false, error: 'Enter a valid URL including http:// or https://' }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'Hub URL must start with http:// or https://' }
    }

    return { ok: true, value: parsed.origin }
}

function isLoopbackHost(hostname: string): boolean {
    return LOCALHOST_HOSTS.has(hostname)
}

function rewriteLoadedLocalOrigin(serverUrl: string, currentOrigin: string): string {
    try {
        const target = new URL(serverUrl)
        const current = new URL(currentOrigin)
        const sameProtocol = target.protocol === current.protocol
        const samePort = target.port === current.port
        const sameHostname = target.hostname === current.hostname

        if (sameProtocol && samePort && !sameHostname && isLoopbackHost(target.hostname)) {
            return current.origin
        }

        return target.origin
    } catch {
        return serverUrl
    }
}

export function resolveServerUrlForCurrentOrigin(serverUrl: string, currentOrigin: string): string {
    return rewriteLoadedLocalOrigin(serverUrl, currentOrigin)
}

export function resolveRemoteDevHubUrl(currentOrigin: string, proxyTarget: string | undefined): string | null {
    if (!currentOrigin || !proxyTarget) {
        return null
    }

    try {
        const current = new URL(currentOrigin)
        const target = new URL(proxyTarget)
        target.hostname = current.hostname
        return target.origin
    } catch {
        return null
    }
}

function getCurrentOrigin(): string {
    if (typeof window === 'undefined') {
        return ''
    }
    return window.location.origin
}

function getServerFromUrlParams(currentOrigin: string): string | null {
    if (typeof window === 'undefined') return null
    const query = new URLSearchParams(window.location.search)
    const hub = query.get('hub')
    if (!hub) {
        return null
    }

    const normalized = normalizeServerUrl(hub)
    if (!normalized.ok) {
        return null
    }

    return resolveServerUrlForCurrentOrigin(normalized.value, currentOrigin)
}

function readStoredServerUrl(currentOrigin: string): string | null {
    const stored = readBrowserStorageItem('local', HUB_URL_KEY)
    if (!stored) {
        return null
    }

    const normalized = normalizeServerUrl(stored)
    if (!normalized.ok) {
        removeBrowserStorageItem('local', HUB_URL_KEY)
        return null
    }
    const resolved = resolveServerUrlForCurrentOrigin(normalized.value, currentOrigin)
    if (resolved !== normalized.value) {
        writeBrowserStorageItem('local', HUB_URL_KEY, resolved)
    }
    return resolved
}

function writeStoredServerUrl(value: string): void {
    writeBrowserStorageItem('local', HUB_URL_KEY, value)
}

function clearStoredServerUrl(): void {
    removeBrowserStorageItem('local', HUB_URL_KEY)
}

export function useServerUrl(): {
    serverUrl: string | null
    baseUrl: string
    setServerUrl: (input: string) => ServerUrlResult
    clearServerUrl: () => void
} {
    const [serverUrl, setServerUrlState] = useState<string | null>(() => {
        const currentOrigin = getCurrentOrigin()
        // Priority: URL params > persisted browser storage
        const fromUrl = getServerFromUrlParams(currentOrigin)
        if (fromUrl) {
            writeStoredServerUrl(fromUrl) // Persist for refresh
            return fromUrl
        }
        return readStoredServerUrl(currentOrigin)
    })

    const fallbackOrigin = typeof window !== 'undefined' ? window.location.origin : ''
    const defaultServerUrl = useMemo(() => {
        return resolveRemoteDevHubUrl(fallbackOrigin, import.meta.env.VITE_HUB_PROXY)
    }, [fallbackOrigin])
    const baseUrl = useMemo(
        () => serverUrl ?? defaultServerUrl ?? fallbackOrigin,
        [defaultServerUrl, fallbackOrigin, serverUrl]
    )

    const setServerUrl = useCallback((input: string): ServerUrlResult => {
        const normalized = normalizeServerUrl(input)
        if (!normalized.ok) {
            return normalized
        }
        const resolved = resolveServerUrlForCurrentOrigin(normalized.value, getCurrentOrigin())
        writeStoredServerUrl(resolved)
        setServerUrlState(resolved)
        return { ok: true, value: resolved }
    }, [])

    const clearServerUrl = useCallback(() => {
        clearStoredServerUrl()
        setServerUrlState(null)
    }, [])

    return {
        serverUrl,
        baseUrl,
        setServerUrl,
        clearServerUrl,
    }
}
