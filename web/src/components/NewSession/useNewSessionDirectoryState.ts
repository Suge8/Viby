import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { machineSupportsBrowseDirectory } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import type { Machine, SessionSummary } from '@/types/api'
import { useMachinePathsExists } from '@/hooks/useMachinePathsExists'
import { useDirectorySuggestions } from '@/hooks/useDirectorySuggestions'
import { useMachineSelection } from './useMachineSelection'
import { useDirectorySuggestionsInput } from './useDirectorySuggestionsInput'
import { deriveDirectoryState } from './directoryState'
import type { SessionType } from './types'

const MAX_PATHS_TO_VERIFY = 1_000

type DirectoryStateResult = {
    trimmedDirectory: string
    selectedMachine: Machine | null
    selectedMachineId: string | null
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
            machineId: string | null
            supportsBrowser: boolean
            selectedPath: string
            recentPaths: string[]
            projectPaths: string[]
            isDisabled: boolean
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
    handleMachineChange: (machineId: string) => void
}

type UseNewSessionDirectoryStateOptions = {
    api: ApiClient
    machines: Machine[]
    sessions: SessionSummary[]
    isDisabled: boolean
    sessionType: SessionType
    t: (key: string) => string
    getRecentPaths: (machineId: string | null) => string[]
    getLastUsedMachineId: () => string | null
}

export function useNewSessionDirectoryState(
    options: UseNewSessionDirectoryStateOptions
): DirectoryStateResult {
    const { api, getLastUsedMachineId, getRecentPaths, isDisabled, machines, sessionType, sessions, t } = options
    const [directory, setDirectory] = useState('')
    const [directoryCreationConfirmed, setDirectoryCreationConfirmed] = useState(false)

    const applyDirectoryPrefill = useCallback((nextDirectory: string) => {
        setDirectory(nextDirectory)
    }, [])

    const {
        selectedMachine,
        selectedMachineId,
        recentPaths,
        handleMachineChange
    } = useMachineSelection({
        machines,
        getRecentPaths,
        getLastUsedMachineId,
        onDirectoryPrefill: applyDirectoryPrefill
    })

    const trimmedDirectory = directory.trim()
    const deferredDirectory = useDeferredValue(trimmedDirectory)
    const allPaths = useDirectorySuggestions(selectedMachineId, sessions, recentPaths)
    const pathsToCheck = useMemo(
        () => Array.from(new Set([
            ...(deferredDirectory ? [deferredDirectory] : []),
            ...allPaths
        ])).slice(0, MAX_PATHS_TO_VERIFY),
        [allPaths, deferredDirectory]
    )

    const { pathExistence, checkPathsExists } = useMachinePathsExists(api, selectedMachineId, pathsToCheck)
    const verifiedPaths = useMemo(
        () => allPaths.filter((path) => pathExistence[path]),
        [allPaths, pathExistence]
    )
    const projectPaths = useMemo(() => {
        const recentSet = new Set(recentPaths)
        return verifiedPaths.filter((path) => !recentSet.has(path))
    }, [recentPaths, verifiedPaths])
    const supportsProjectPicker = useMemo(
        () => machineSupportsBrowseDirectory(selectedMachine?.metadata?.capabilities),
        [selectedMachine?.metadata?.capabilities]
    )

    const currentDirectoryExists = trimmedDirectory ? pathExistence[trimmedDirectory] : undefined
    const {
        createLabel,
        missingWorktreeDirectory,
        statusMessage,
        statusTone
    } = useMemo(() => deriveDirectoryState({
        currentDirectoryExists,
        directoryCreationConfirmed,
        sessionType,
        trimmedDirectory,
        t
    }), [currentDirectoryExists, directoryCreationConfirmed, sessionType, t, trimmedDirectory])

    useEffect(() => {
        setDirectoryCreationConfirmed(false)
    }, [selectedMachineId, sessionType, trimmedDirectory])

    const handlePathSelect = useCallback((path: string) => {
        setDirectory(path)
    }, [])
    const {
        suggestions,
        selectedIndex,
        handleDirectoryBlur,
        handleDirectoryChange,
        handleDirectoryFocus,
        handleDirectoryKeyDown,
        handleSuggestionSelect
    } = useDirectorySuggestionsInput({
        directory,
        verifiedPaths,
        onDirectoryChange: setDirectory
    })

    return {
        trimmedDirectory,
        selectedMachine,
        selectedMachineId,
        directorySectionProps: {
            input: {
                directory,
                suggestions,
                selectedIndex,
                isDisabled,
                onDirectoryChange: handleDirectoryChange,
                onDirectoryFocus: handleDirectoryFocus,
                onDirectoryBlur: handleDirectoryBlur,
                onDirectoryKeyDown: handleDirectoryKeyDown,
                onSuggestionSelect: handleSuggestionSelect
            },
            picker: {
                api,
                machineId: selectedMachineId,
                supportsBrowser: supportsProjectPicker,
                selectedPath: directory,
                recentPaths,
                projectPaths,
                isDisabled,
                onPathSelect: handlePathSelect
            },
            status: {
                statusMessage,
                statusTone
            }
        },
        createLabel,
        missingWorktreeDirectory,
        directoryCreationConfirmed,
        checkPathsExists,
        confirmDirectoryCreation: () => setDirectoryCreationConfirmed(true),
        handleMachineChange
    }
}
