import { useCallback, useRef, useState } from 'react'
import { submitNewSessionCreation } from './createSessionSubmit'
import { resolveLaunchPermissionMode } from './launchConfig'
import { commitNewSessionPreferences, type NewSessionPreferences } from './preferences'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection, SessionType } from './types'

type UseNewSessionCreateActionOptions = {
    trimmedDirectory: string
    sessionType: SessionType
    worktreeName: string
    yoloMode: boolean
    directoryCreationConfirmed: boolean
    effectiveAgent: AgentType
    effectiveModel: string
    effectiveReasoningEffort: ModelReasoningEffortSelection
    effectiveCodexServiceTier: CodexServiceTierSelection
    canStart: boolean
    blockedMessage?: string
    checkPathsExists: (paths: string[]) => Promise<Record<string, boolean>>
    confirmDirectoryCreation: () => void
    spawnSession: Parameters<typeof submitNewSessionCreation>[0]['spawnSession']
    buildPreferenceSnapshotFor: (
        targetAgent: AgentType,
        nextModel: string,
        nextReasoningEffort: ModelReasoningEffortSelection,
        nextCodexServiceTier: CodexServiceTierSelection
    ) => NewSessionPreferences
    addRecentPath: (path: string) => void
    onSuccess: (sessionId: string) => Promise<void> | void
    notifySuccess: () => void
    notifyError: () => void
    setError: (message: string | null) => void
    t: (key: string) => string
    formatError: (error: unknown) => string
}

type NewSessionCreatePhase = 'idle' | 'creating' | 'opening'

type UseNewSessionCreateActionResult = {
    canCreate: boolean
    createPhase: NewSessionCreatePhase
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
        effectiveCodexServiceTier,
        canStart,
        blockedMessage,
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
    const createInFlightRef = useRef(false)
    const [createPhase, setCreatePhase] = useState<NewSessionCreatePhase>('idle')
    const canCreate = Boolean(trimmedDirectory) && canStart

    const handleCreate = useCallback(async (): Promise<void> => {
        if (createInFlightRef.current || createPhase !== 'idle') return
        if (!trimmedDirectory || !canStart) {
            if (blockedMessage) setError(blockedMessage)
            return
        }

        createInFlightRef.current = true
        let didOpen = false
        setCreatePhase('creating')
        setError(null)
        try {
            await submitNewSessionCreation({
                agent: effectiveAgent,
                sessionType,
                worktreeName,
                model: effectiveModel,
                modelReasoningEffort: effectiveReasoningEffort,
                codexServiceTier: effectiveCodexServiceTier,
                yoloMode,
                trimmedDirectory,
                directoryCreationConfirmed,
                checkPathsExists,
                confirmDirectoryCreation,
                spawnSession,
                resolvePermissionMode: resolveLaunchPermissionMode,
                buildPreferenceSnapshot: () =>
                    buildPreferenceSnapshotFor(
                        effectiveAgent,
                        effectiveModel,
                        effectiveReasoningEffort,
                        effectiveCodexServiceTier
                    ),
                commitPreferences: commitNewSessionPreferences,
                addRecentPath,
                notifySuccess,
                onOpening: () => {
                    didOpen = true
                    setCreatePhase('opening')
                },
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
            createInFlightRef.current = false
            notifyError()
            setError(formatError(nextError))
            setCreatePhase('idle')
        } finally {
            if (!didOpen) {
                createInFlightRef.current = false
                setCreatePhase('idle')
            }
        }
    }, [
        addRecentPath,
        buildPreferenceSnapshotFor,
        blockedMessage,
        canStart,
        checkPathsExists,
        confirmDirectoryCreation,
        createPhase,
        directoryCreationConfirmed,
        effectiveAgent,
        effectiveModel,
        effectiveCodexServiceTier,
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
        createPhase,
        handleCreate,
    }
}
