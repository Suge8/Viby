import type { CommandCapability, SessionDriver } from '@viby/protocol/types'
import { access, readdir, stat } from 'fs/promises'
import { dirname, join, resolve } from 'path'
import { startFileWatcher } from '@/modules/watcher/startFileWatcher'
import { hashObject } from '@/utils/deterministicJson'

export type CommandCapabilitySnapshot = {
    capabilities: CommandCapability[]
    revision: string
}

type CommandCapabilityCacheEntry = {
    value: CommandCapabilitySnapshot | null
    promise: Promise<CommandCapabilitySnapshot> | null
    stale: boolean
    invalidationListeners: Set<() => void>
    stopWatchers: Array<() => void>
    watchTargets: string[]
    watchFingerprint: string | null
    idleTimer: ReturnType<typeof setTimeout> | null
    lastAccessedAt: number
}

const commandCapabilityCache = new Map<string, CommandCapabilityCacheEntry>()
const COMMAND_CAPABILITY_CACHE_IDLE_MS = 5 * 60_000

function createCacheKey(agent: SessionDriver, workingDirectory?: string): string {
    return `${agent}:${workingDirectory ? resolve(workingDirectory) : 'global'}`
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

async function resolveWatchTarget(path: string): Promise<string | null> {
    let currentPath = resolve(path)
    while (true) {
        if (await pathExists(currentPath)) {
            return currentPath
        }

        const parentPath = dirname(currentPath)
        if (parentPath === currentPath) {
            return null
        }
        currentPath = parentPath
    }
}

async function resolveWatchTargets(paths: readonly string[]): Promise<string[]> {
    const targets = await Promise.all(paths.map(async (path) => await resolveWatchTarget(path)))
    return [...new Set(targets.filter((target): target is string => target !== null))]
}

async function collectFingerprintRows(path: string, rows: string[]): Promise<void> {
    try {
        const info = await stat(path)
        rows.push(`${path}:${info.isDirectory() ? 'd' : 'f'}:${info.mtimeMs}:${info.size}`)
        if (!info.isDirectory()) {
            return
        }

        const entries = await readdir(path, { withFileTypes: true })
        await Promise.all(
            entries
                .filter((entry) => entry.isDirectory() || entry.isFile())
                .map(async (entry) => await collectFingerprintRows(join(path, entry.name), rows))
        )
    } catch {
        rows.push(`${path}:missing`)
    }
}

async function buildWatchFingerprint(paths: readonly string[]): Promise<string> {
    const rows: string[] = []
    await Promise.all(paths.map(async (path) => await collectFingerprintRows(path, rows)))
    return hashObject(rows.sort(), { sortArrays: false }, 'base64url')
}

function ensureCacheEntry(key: string): CommandCapabilityCacheEntry {
    const existing = commandCapabilityCache.get(key)
    if (existing) {
        return existing
    }

    const created: CommandCapabilityCacheEntry = {
        value: null,
        promise: null,
        stale: true,
        invalidationListeners: new Set(),
        stopWatchers: [],
        watchTargets: [],
        watchFingerprint: null,
        idleTimer: null,
        lastAccessedAt: Date.now(),
    }
    commandCapabilityCache.set(key, created)
    return created
}

function stopCacheEntryWatchers(entry: CommandCapabilityCacheEntry): void {
    for (const stopWatcher of entry.stopWatchers) {
        stopWatcher()
    }

    entry.stopWatchers = []
}

function clearIdleTimer(entry: CommandCapabilityCacheEntry): void {
    if (!entry.idleTimer) {
        return
    }

    clearTimeout(entry.idleTimer)
    entry.idleTimer = null
}

function disposeCacheEntry(key: string, entry: CommandCapabilityCacheEntry): void {
    clearIdleTimer(entry)
    stopCacheEntryWatchers(entry)
    commandCapabilityCache.delete(key)
}

function touchCacheEntry(key: string, entry: CommandCapabilityCacheEntry): void {
    entry.lastAccessedAt = Date.now()
    clearIdleTimer(entry)
    entry.idleTimer = setTimeout(() => {
        if (Date.now() - entry.lastAccessedAt < COMMAND_CAPABILITY_CACHE_IDLE_MS) {
            touchCacheEntry(key, entry)
            return
        }

        disposeCacheEntry(key, entry)
    }, COMMAND_CAPABILITY_CACHE_IDLE_MS)
}

function markCacheEntryStale(entry: CommandCapabilityCacheEntry): void {
    if (entry.stale) {
        return
    }

    entry.stale = true
    for (const listener of entry.invalidationListeners) {
        listener()
    }
}

async function refreshWatchers(entry: CommandCapabilityCacheEntry, watchTargets: readonly string[]): Promise<void> {
    stopCacheEntryWatchers(entry)
    entry.watchTargets = [...watchTargets]
    entry.watchFingerprint = await buildWatchFingerprint(watchTargets)
    entry.stopWatchers = watchTargets.map((target) =>
        startFileWatcher(target, () => {
            markCacheEntryStale(entry)
        })
    )
}

async function hasWatchFingerprintChanged(entry: CommandCapabilityCacheEntry): Promise<boolean> {
    if (entry.watchFingerprint === null) {
        return false
    }

    return (await buildWatchFingerprint(entry.watchTargets)) !== entry.watchFingerprint
}

export async function loadCachedCommandCapabilities(options: {
    agent: SessionDriver
    workingDirectory?: string
    load: () => Promise<CommandCapability[]>
    listWatchRoots: () => Promise<string[]>
    onInvalidate?: () => void
}): Promise<CommandCapabilitySnapshot> {
    const cacheKey = createCacheKey(options.agent, options.workingDirectory)
    const entry = ensureCacheEntry(cacheKey)
    touchCacheEntry(cacheKey, entry)
    if (options.onInvalidate) {
        entry.invalidationListeners.add(options.onInvalidate)
    }

    if (!entry.stale && entry.value && !(await hasWatchFingerprintChanged(entry))) {
        return entry.value
    }

    if (entry.promise) {
        return await entry.promise
    }

    entry.promise = (async () => {
        try {
            const [capabilities, watchRoots] = await Promise.all([options.load(), options.listWatchRoots()])
            await refreshWatchers(entry, await resolveWatchTargets(watchRoots))
            entry.value = {
                capabilities,
                revision: hashObject(capabilities, { sortArrays: false }, 'base64url'),
            }
            entry.stale = false
            return entry.value
        } finally {
            entry.promise = null
        }
    })()

    return await entry.promise
}

export function resetCommandCapabilityCache(): void {
    for (const [key, entry] of commandCapabilityCache.entries()) {
        disposeCacheEntry(key, entry)
    }
}
