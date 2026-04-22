import { machineSupportsBrowseDirectory as runtimeSupportsBrowseDirectory } from '@viby/protocol'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useRuntimePathsExists } from '@/hooks/useRuntimePathsExists'
import type { LocalRuntime, SessionSummary } from '@/types/api'
import { deriveDirectoryState } from './directoryState'
import type { SessionType } from './types'
import { useDirectorySuggestionsInput } from './useDirectorySuggestionsInput'

const MAX_PATHS_TO_VERIFY = 1_000

type DirectoryStateResult = {
    trimmedDirectory: string
    directorySectionProps: {
        input: {
            directory: string
            suggestions: ReturnType<typeof useDirectorySuggestionsInput>['suggestions']
            selectedIndex: number
            isDisabled: boolean
            onDirectoryChange: (value: string) => void
            onDirectoryFocus: () => void
            onDirectoryBlur: () => void
            onDirectoryKeyDown: ReturnType<typeof useDirectorySuggestionsInput>['handleDirectoryKeyDown']
            onSuggestionSelect: (index: number) => void
        }
        picker: {
            api: ApiClient
            supportsBrowser: boolean
            selectedPath: string
            recentPaths: string[]
            projectPaths: string[]
            isDisabled: boolean
            onOpen: () => void
            onPathSelect: (path: string) => void
        }
        status: {
            statusMessage: string | null
            statusTone: 'warning' | 'error' | null
        }
    }
    createLabel?: string
    missingWorktreeDirectory: boolean
    directoryCreationConfirmed: boolean
    checkPathsExists: (pathsToCheck: string[]) => Promise<Record<string, boolean>>
    confirmDirectoryCreation: () => void
}

type UseNewSessionDirectoryStateOptions = {
    api: ApiClient
    runtime: LocalRuntime
    sessions: SessionSummary[]
    isDisabled: boolean
    sessionType: SessionType
    t: (key: string) => string
    getRecentPaths: () => string[]
}

export function useNewSessionDirectoryState(options: UseNewSessionDirectoryStateOptions): DirectoryStateResult {
    const { api, getRecentPaths, isDisabled, runtime, sessionType, sessions, t } = options
    const [directory, setDirectory] = useState('')
    const [directoryCreationConfirmed, setDirectoryCreationConfirmed] = useState(false)
    const [knownPathChecksEnabled, setKnownPathChecksEnabled] = useState(false)
    const hasPrefilledRecentPath = useRef(false)
    const recentPaths = useMemo(() => getRecentPaths(), [getRecentPaths])
    useEffect(() => {
        if (hasPrefilledRecentPath.current) {
            return
        }

        const firstRecentPath = recentPaths[0]
        if (!firstRecentPath) {
            return
        }

        hasPrefilledRecentPath.current = true
        setDirectory((current) => (current.trim().length > 0 ? current : firstRecentPath))
    }, [recentPaths])

    const trimmedDirectory = directory.trim()
    const deferredDirectory = useDeferredValue(trimmedDirectory)
    const allPaths = useDirectorySuggestions(sessions, recentPaths)
    const enableKnownPathChecks = useCallback(() => {
        setKnownPathChecksEnabled(true)
    }, [])
    const pathsToCheck = useMemo(
        () =>
            Array.from(
                new Set([
                    ...(deferredDirectory ? [deferredDirectory] : []),
                    ...(knownPathChecksEnabled ? allPaths : []),
                ])
            ).slice(0, MAX_PATHS_TO_VERIFY),
        [allPaths, deferredDirectory, knownPathChecksEnabled]
    )

    const { pathExistence, checkPathsExists } = useRuntimePathsExists(api, pathsToCheck)
    const verifiedPaths = useMemo(() => allPaths.filter((path) => pathExistence[path]), [allPaths, pathExistence])
    const projectPaths = useMemo(() => {
        const recentSet = new Set(recentPaths)
        return verifiedPaths.filter((path) => !recentSet.has(path))
    }, [recentPaths, verifiedPaths])
    const supportsProjectPicker = useMemo(
        () => runtimeSupportsBrowseDirectory(runtime.metadata?.capabilities),
        [runtime.metadata?.capabilities]
    )

    const currentDirectoryExists = trimmedDirectory ? pathExistence[trimmedDirectory] : undefined
    const { createLabel, missingWorktreeDirectory, statusMessage, statusTone } = useMemo(
        () =>
            deriveDirectoryState({
                currentDirectoryExists,
                directoryCreationConfirmed,
                sessionType,
                trimmedDirectory,
                t,
            }),
        [currentDirectoryExists, directoryCreationConfirmed, sessionType, t, trimmedDirectory]
    )

    useEffect(() => {
        setDirectoryCreationConfirmed(false)
    }, [sessionType, trimmedDirectory])

    const handlePathSelect = useCallback(
        (path: string) => {
            enableKnownPathChecks()
            setDirectory(path)
        },
        [enableKnownPathChecks]
    )
    const {
        suggestions,
        selectedIndex,
        handleDirectoryBlur,
        handleDirectoryChange,
        handleDirectoryFocus,
        handleDirectoryKeyDown,
        handleSuggestionSelect,
    } = useDirectorySuggestionsInput({
        directory,
        verifiedPaths,
        onDirectoryChange: setDirectory,
    })

    return {
        trimmedDirectory,
        directorySectionProps: {
            input: {
                directory,
                suggestions,
                selectedIndex,
                isDisabled,
                onDirectoryChange: (value) => {
                    enableKnownPathChecks()
                    handleDirectoryChange(value)
                },
                onDirectoryFocus: () => {
                    enableKnownPathChecks()
                    handleDirectoryFocus()
                },
                onDirectoryBlur: handleDirectoryBlur,
                onDirectoryKeyDown: handleDirectoryKeyDown,
                onSuggestionSelect: handleSuggestionSelect,
            },
            picker: {
                api,
                supportsBrowser: supportsProjectPicker,
                selectedPath: directory,
                recentPaths,
                projectPaths,
                isDisabled,
                onOpen: enableKnownPathChecks,
                onPathSelect: handlePathSelect,
            },
            status: {
                statusMessage,
                statusTone,
            },
        },
        createLabel,
        missingWorktreeDirectory,
        directoryCreationConfirmed,
        checkPathsExists,
        confirmDirectoryCreation: () => setDirectoryCreationConfirmed(true),
    }
}
