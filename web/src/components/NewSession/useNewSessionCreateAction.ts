import { useCallback } from 'react'
import { submitNewSessionCreation } from './createSessionSubmit'
import { resolveLaunchPermissionMode } from './launchConfig'
import { commitNewSessionPreferences, type NewSessionPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection, SessionType } from './types'

type UseNewSessionCreateActionOptions = {
    trimmedDirectory: string
    sessionType: SessionType
    worktreeName: string
    yoloMode: boolean
    directoryCreationConfirmed: boolean
    effectiveAgent: AgentType
    effectiveModel: string
    effectiveReasoningEffort: ModelReasoningEffortSelection
    checkPathsExists: (paths: string[]) => Promise<Record<string, boolean>>
    confirmDirectoryCreation: () => void
    spawnSession: Parameters<typeof submitNewSessionCreation>[0]['spawnSession']
    buildPreferenceSnapshotFor: (
        targetAgent: AgentType,
        nextModel: string,
        nextReasoningEffort: ModelReasoningEffortSelection
    ) => NewSessionPreferences
    addRecentPath: (path: string) => void
    onSuccess: (sessionId: string) => void
    notifySuccess: () => void
    notifyError: () => void
    setError: (message: string | null) => void
    t: (key: string) => string
    formatError: (error: unknown) => string
}

type UseNewSessionCreateActionResult = {
    canCreate: boolean
    handleCreate: () => Promise<void>
}

export function useNewSessionCreateAction(options: UseNewSessionCreateActionOptions): UseNewSessionCreateActionResult {
    const {
        trimmedDirectory,
        sessionType,
        worktreeName,
        yoloMode,
        directoryCreationConfirmed,
        effectiveAgent,
        effectiveModel,
        effectiveReasoningEffort,
        checkPathsExists,
        confirmDirectoryCreation,
        spawnSession,
        buildPreferenceSnapshotFor,
        addRecentPath,
        onSuccess,
        notifySuccess,
        notifyError,
        setError,
        t,
        formatError,
    } = options
    const canCreate = Boolean(trimmedDirectory)

    const handleCreate = useCallback(async (): Promise<void> => {
        if (!trimmedDirectory) {
            return
        }

        setError(null)
        try {
            await submitNewSessionCreation({
                agent: effectiveAgent,
                sessionType,
                worktreeName,
                model: effectiveModel,
                modelReasoningEffort: effectiveReasoningEffort,
                yoloMode,
                trimmedDirectory,
                directoryCreationConfirmed,
                checkPathsExists,
                confirmDirectoryCreation,
                spawnSession,
                resolvePermissionMode: resolveLaunchPermissionMode,
                buildPreferenceSnapshot: () =>
                    buildPreferenceSnapshotFor(effectiveAgent, effectiveModel, effectiveReasoningEffort),
                commitPreferences: commitNewSessionPreferences,
                addRecentPath,
                notifySuccess,
                onSuccess,
                onWorktreeMissing: () => {
                    notifyError()
                    setError(t('session.directoryMissingWorktree'))
                },
                onNeedsDirectoryCreation: () => undefined,
                onError: (message) => {
                    notifyError()
                    setError(formatError(message))
                },
            })
        } catch (nextError) {
            notifyError()
            setError(formatError(nextError))
        }
    }, [
        addRecentPath,
        buildPreferenceSnapshotFor,
        checkPathsExists,
        confirmDirectoryCreation,
        directoryCreationConfirmed,
        effectiveAgent,
        effectiveModel,
        effectiveReasoningEffort,
        formatError,
        notifyError,
        notifySuccess,
        onSuccess,
        sessionType,
        setError,
        spawnSession,
        t,
        trimmedDirectory,
        worktreeName,
        yoloMode,
    ])

    return {
        canCreate,
        handleCreate,
    }
}
