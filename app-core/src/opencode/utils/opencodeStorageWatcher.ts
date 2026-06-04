import { existsSync, type FSWatcher, readdirSync, statSync, watch } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { logger } from '@/ui/logger'
import type { OpencodeStorageSource } from './opencodeStorageDatabase'

export type OpencodeStorageWatchScope = {
    storageDir: string
    activeSessionId: string | null
    activeStorageSource: OpencodeStorageSource | null
    messageIds: readonly string[]
}

export class OpencodeStorageWatcher {
    private readonly watchers = new Map<string, FSWatcher>()
    private stopped = false

    constructor(private readonly onStorageChanged: () => void) {}

    refresh(scope: OpencodeStorageWatchScope): void {
        if (this.stopped) return
        const directories = resolveWatchDirectories(scope)
        for (const path of this.watchers.keys()) {
            if (!directories.has(path)) this.closePath(path)
        }
        for (const directory of directories) {
            this.watchDirectory(directory)
        }
    }

    close(): void {
        this.stopped = true
        for (const path of this.watchers.keys()) {
            this.closePath(path)
        }
    }

    private watchDirectory(directory: string): void {
        if (this.watchers.has(directory)) return
        try {
            const watcher = watch(directory, () => {
                if (!this.stopped) this.onStorageChanged()
            })
            watcher.once('error', (error) => {
                logger.debug(`[opencode-storage] Watch error for ${directory}: ${error.message}`)
                this.closePath(directory)
                if (!this.stopped) this.onStorageChanged()
            })
            this.watchers.set(directory, watcher)
        } catch (error) {
            logger.debug(`[opencode-storage] Failed to watch ${directory}: ${error}`)
        }
    }

    private closePath(path: string): void {
        this.watchers.get(path)?.close()
        this.watchers.delete(path)
    }
}

export function resolveWatchDirectories(scope: OpencodeStorageWatchScope): Set<string> {
    const directories = new Set<string>()
    addExistingOrNearestParent(directories, scope.storageDir)
    addExistingOrNearestParent(directories, join(scope.storageDir, '..'))
    addDirectory(directories, scope.storageDir)
    addDirectory(directories, join(scope.storageDir, 'session'))
    addChildDirectories(directories, join(scope.storageDir, 'session'))

    if (scope.activeSessionId && scope.activeStorageSource !== 'database') {
        addDirectory(directories, join(scope.storageDir, 'message'))
        addDirectory(directories, join(scope.storageDir, 'message', scope.activeSessionId))
        addDirectory(directories, join(scope.storageDir, 'part'))
        for (const messageId of scope.messageIds) {
            addDirectory(directories, join(scope.storageDir, 'part', messageId))
        }
    }

    return directories
}

function addExistingOrNearestParent(directories: Set<string>, path: string): void {
    const directory = nearestExistingDirectory(path)
    if (directory) directories.add(directory)
}

function addDirectory(directories: Set<string>, path: string): void {
    const directory = normalizeExistingDirectory(path)
    if (directory) directories.add(directory)
}

function addChildDirectories(directories: Set<string>, path: string): void {
    const parent = normalizeExistingDirectory(path)
    if (!parent) return
    try {
        for (const entry of readdirSync(parent, { withFileTypes: true })) {
            if (entry.isDirectory()) directories.add(resolve(parent, entry.name))
        }
    } catch (error) {
        logger.debug(`[opencode-storage] Failed to list watch directories under ${parent}: ${error}`)
    }
}

function nearestExistingDirectory(path: string): string | null {
    let current = resolve(path)
    while (!existsSync(current)) {
        const parent = dirname(current)
        if (parent === current) return null
        current = parent
    }
    return normalizeExistingDirectory(current) ?? normalizeExistingDirectory(dirname(current))
}

function normalizeExistingDirectory(path: string): string | null {
    const resolved = resolve(path)
    try {
        return statSync(resolved).isDirectory() ? resolved : null
    } catch {
        return null
    }
}
