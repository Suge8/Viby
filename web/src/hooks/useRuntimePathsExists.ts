import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'

const EMPTY_PATH_EXISTENCE = Object.freeze({}) as Record<string, boolean>

function normalizePaths(paths: string[]): string[] {
    return Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean))).sort()
}

function isPathExistenceEmpty(value: Record<string, boolean>): boolean {
    return Object.keys(value).length === 0
}

function arePathExistenceMapsEqual(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
        return false
    }

    return leftKeys.every((key) => left[key] === right[key])
}

export function useRuntimePathsExists(
    api: ApiClient,
    paths: string[]
): {
    pathExistence: Record<string, boolean>
    checkPathsExists: (pathsToCheck: string[]) => Promise<Record<string, boolean>>
} {
    const [pathExistence, setPathExistence] = useState<Record<string, boolean>>(EMPTY_PATH_EXISTENCE)
    const normalizedPaths = normalizePaths(paths)
    const normalizedPathsKey = normalizedPaths.join('\n')

    useEffect(() => {
        let cancelled = false

        if (normalizedPaths.length === 0) {
            setPathExistence((current) => (isPathExistenceEmpty(current) ? current : EMPTY_PATH_EXISTENCE))
            return () => {
                cancelled = true
            }
        }

        void api
            .checkRuntimePathsExists(normalizedPaths)
            .then((result) => {
                if (cancelled) return
                const nextExistence = result.exists ?? EMPTY_PATH_EXISTENCE
                setPathExistence((current) =>
                    arePathExistenceMapsEqual(current, nextExistence) ? current : nextExistence
                )
            })
            .catch(() => {
                if (cancelled) return
                setPathExistence((current) => (isPathExistenceEmpty(current) ? current : EMPTY_PATH_EXISTENCE))
            })

        return () => {
            cancelled = true
        }
    }, [api, normalizedPathsKey])

    const checkPathsExists = useCallback(
        async (pathsToCheck: string[]) => {
            const normalizedPathsToCheck = normalizePaths(pathsToCheck)
            if (normalizedPathsToCheck.length === 0) {
                return {}
            }

            const result = await api.checkRuntimePathsExists(normalizedPathsToCheck)
            const exists = result.exists ?? {}
            setPathExistence((current) => {
                const merged = { ...current, ...exists }
                return arePathExistenceMapsEqual(current, merged) ? current : merged
            })
            return exists
        },
        [api]
    )

    return {
        pathExistence,
        checkPathsExists,
    }
}
