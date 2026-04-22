import { useState } from 'react'
import { readBrowserStorageItem, writeBrowserStorageJson } from '@/lib/browserStorage'
import { LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

const STORAGE_KEY = LOCAL_STORAGE_KEYS.recentPaths
const MAX_RECENT_PATHS = 5

function dedupeRecentPaths(paths: readonly string[]): string[] {
    return [...new Set(paths.map((value) => value.trim()).filter(Boolean))].slice(0, MAX_RECENT_PATHS)
}

function loadRecentPaths(): string[] {
    const stored = readBrowserStorageItem('local', STORAGE_KEY)
    if (!stored) {
        return []
    }

    try {
        const parsed = JSON.parse(stored) as unknown
        if (Array.isArray(parsed)) {
            return dedupeRecentPaths(parsed.filter((value): value is string => typeof value === 'string'))
        }
        if (parsed && typeof parsed === 'object') {
            return dedupeRecentPaths(
                Object.values(parsed)
                    .flatMap((value) => (Array.isArray(value) ? value : []))
                    .filter((value): value is string => typeof value === 'string')
            )
        }
        return []
    } catch {
        return []
    }
}

function saveRecentPaths(data: string[]): void {
    writeBrowserStorageJson('local', STORAGE_KEY, data)
}

export function useRecentPaths() {
    const [data, setData] = useState<string[]>(loadRecentPaths)

    function getRecentPaths(): string[] {
        return data
    }

    function addRecentPath(path: string): void {
        const trimmed = path.trim()
        if (!trimmed) return

        setData((prev) => {
            const updated = [trimmed, ...prev.filter((value) => value !== trimmed)].slice(0, MAX_RECENT_PATHS)
            saveRecentPaths(updated)
            return updated
        })
    }

    return {
        getRecentPaths,
        addRecentPath,
    }
}
