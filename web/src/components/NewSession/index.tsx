import { useCallback, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InlineNotice } from '@/components/InlineNotice'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useRuntimeAgentLaunchConfig } from '@/hooks/queries/useRuntimeAgentLaunchConfig'
import { useSessions } from '@/hooks/queries/useSessions'
import { usePlatform } from '@/hooks/usePlatform'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { LocalRuntime } from '@/types/api'
import { ActionButtons } from './ActionButtons'
import { DirectorySection } from './DirectorySection'
import { NewSessionLaunchPanel } from './NewSessionLaunchPanel'
import { NewSessionModeSegmented } from './NewSessionModeSegmented'
import { isEffectiveAgentReady } from './newSessionAvailability'
import { type NewSessionMode } from './newSessionModes'
import { RecoverLocalPanel } from './RecoverLocalPanel'
import { SessionTypeSelector } from './SessionTypeSelector'
import { useAgentLaunchOptions } from './useAgentLaunchOptions'
import { useEffectiveNewSessionLaunchState } from './useEffectiveNewSessionLaunchState'
import { useNewSessionCreateAction } from './useNewSessionCreateAction'
import { useNewSessionDirectoryState } from './useNewSessionDirectoryState'
import { useNewSessionLaunchForm } from './useNewSessionLaunchForm'
import { useRecoverLocalState } from './useRecoverLocalState'

export function NewSession(props: {
    api: ApiClient
    runtime: LocalRuntime
    initialMode?: NewSessionMode
    onSuccess: (sessionId: string) => Promise<void> | void
    onCancel: () => void
}): React.JSX.Element {
    const { haptic } = usePlatform()
    const { t } = useTranslation()
    const createErrorPreset = getNoticePreset('newSessionCreateError', t)
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = isPending
    const { getRecentPaths, addRecentPath } = useRecentPaths()
    const [error, setError] = useState<string | null>(null)
    const {
        agent,
        model,
        modelReasoningEffort,
        codexServiceTier,
        yoloMode,
        sessionType,
        worktreeName,
        worktreeInputRef,
        buildPreferenceSnapshotFor,
        updateAgentSetting,
        getAgentLaunchPreferences,
        setModel,
        setModelReasoningEffort,
        setAgentModel,
        setAgentModelReasoningEffort,
        setYoloMode,
        setSessionType,
        setWorktreeName,
        handleAgentChange,
        handleModelChange,
        handleReasoningEffortChange,
        handleCodexServiceTierChange,
    } = useNewSessionLaunchForm()

    const {
        createLabel,
        directorySectionProps,
        checkPathsExists,
        confirmDirectoryCreation,
        directoryCreationConfirmed,
        missingWorktreeDirectory,
        trimmedDirectory,
    } = useNewSessionDirectoryState({
        api: props.api,
        runtime: props.runtime,
        sessions,
        isDisabled: isFormDisabled,
        sessionType,
        t,
        getRecentPaths,
    })

    const {
        agentAvailability,
        isAgentAvailabilityLoading,
        isAgentAvailabilityRefreshing,
        agentAvailabilityError,
        refetchAgentAvailability,
        effectiveAgentSelection,
        effectiveModel,
        effectiveReasoningEffort,
        effectiveCodexServiceTier,
        handleLaunchModelChange,
        handleLaunchReasoningEffortChange,
    } = useEffectiveNewSessionLaunchState({
        api: props.api,
        directory: trimmedDirectory,
        agent,
        model,
        modelReasoningEffort,
        codexServiceTier,
        getAgentLaunchPreferences,
        setAgentModel,
        setAgentModelReasoningEffort,
        handleModelChange,
        handleReasoningEffortChange,
    })

    const {
        config: agentLaunchConfig,
        error: agentLaunchConfigError,
        refetch: refetchAgentLaunchConfig,
    } = useRuntimeAgentLaunchConfig({
        api: props.api,
        agent: effectiveAgentSelection.effectiveAgent,
        directory: trimmedDirectory,
        t,
    })

    const { modelOptions, reasoningOptions } = useAgentLaunchOptions({
        agent: effectiveAgentSelection.effectiveAgent,
        model: effectiveModel,
        modelReasoningEffort: effectiveReasoningEffort,
        directory: trimmedDirectory,
        launchConfig: agentLaunchConfig,
        updateAgentSetting,
        setModel,
        setModelReasoningEffort,
    })

    const formatRecoverError = useCallback(
        (nextError: unknown) =>
            formatUserFacingErrorMessage(nextError, {
                t,
                fallbackKey: 'chat.resumeFailed.generic',
            }),
        [t]
    )

    const recoverLocal = useRecoverLocalState({
        api: props.api,
        initialMode: props.initialMode,
        isFormDisabled,
        directory: trimmedDirectory,
        haptic,
        onSuccess: props.onSuccess,
        clearError: () => setError(null),
        setError,
        formatError: formatRecoverError,
        t,
    })

    const formatCreateError = useCallback(
        (nextError: unknown) =>
            formatUserFacingErrorMessage(nextError, {
                t,
                fallbackKey: 'error.session.create',
            }),
        [t]
    )
    const {
        canCreate: hasCreateDirectory,
        createPhase,
        handleCreate,
    } = useNewSessionCreateAction({
        trimmedDirectory,
        sessionType,
        worktreeName,
        yoloMode,
        directoryCreationConfirmed,
        effectiveAgent: effectiveAgentSelection.effectiveAgent,
        effectiveModel,
        effectiveReasoningEffort,
        effectiveCodexServiceTier,
        checkPathsExists,
        confirmDirectoryCreation,
        spawnSession,
        buildPreferenceSnapshotFor,
        addRecentPath,
        onSuccess: props.onSuccess,
        notifySuccess: () => haptic.notification('success'),
        notifyError: () => haptic.notification('error'),
        setError,
        t,
        formatError: formatCreateError,
    })
    const isCreateOpening = createPhase === 'opening'
    const canCreate =
        hasCreateDirectory &&
        !isFormDisabled &&
        createPhase === 'idle' &&
        !missingWorktreeDirectory &&
        !isAgentAvailabilityLoading &&
        isEffectiveAgentReady(effectiveAgentSelection.effectiveAgentAvailability)
    const submitLabel = recoverLocal.mode === 'recover-local' ? recoverLocal.recoverActionLabel : createLabel
    const pendingLabel = recoverLocal.isRecovering
        ? t('newSession.recover.opening')
        : isCreateOpening
          ? t('newSession.opening')
          : undefined
    const handleRefreshAgentAvailability = useCallback((): void => {
        void Promise.all([refetchAgentAvailability(), refetchAgentLaunchConfig()])
    }, [refetchAgentAvailability, refetchAgentLaunchConfig])

    return (
        <MotionStaggerGroup className="flex flex-col gap-3" delay={0.03} stagger={0.07}>
            <MotionStaggerItem y={14}>
                <NewSessionModeSegmented
                    mode={recoverLocal.mode}
                    isDisabled={isFormDisabled}
                    onModeChange={recoverLocal.setMode}
                />
            </MotionStaggerItem>

            <MotionStaggerItem y={14}>
                <DirectorySection {...directorySectionProps} />
            </MotionStaggerItem>

            {recoverLocal.mode === 'start' ? (
                <>
                    <MotionStaggerItem y={14}>
                        <SessionTypeSelector
                            sessionType={sessionType}
                            worktreeName={worktreeName}
                            worktreeInputRef={worktreeInputRef}
                            isDisabled={isFormDisabled}
                            onSessionTypeChange={setSessionType}
                            onWorktreeNameChange={setWorktreeName}
                        />
                    </MotionStaggerItem>
                    <MotionStaggerItem y={14}>
                        <NewSessionLaunchPanel
                            form={{
                                agent: effectiveAgentSelection.effectiveAgent,
                                model: effectiveModel,
                                modelReasoningEffort: effectiveReasoningEffort,
                                codexServiceTier: effectiveCodexServiceTier,
                                yoloMode,
                            }}
                            options={{
                                modelOptions,
                                reasoningOptions,
                                isDisabled: isFormDisabled,
                                agentAvailability,
                                agentAvailabilityLoading: isAgentAvailabilityLoading,
                                agentAvailabilityRefreshing: isAgentAvailabilityRefreshing,
                                agentAvailabilityError,
                                savedAgent: agent,
                                savedAgentAvailability: effectiveAgentSelection.rawAgentAvailability,
                                hasAgentFallback: effectiveAgentSelection.hasFallback,
                                agentLaunchConfigError,
                            }}
                            handlers={{
                                onAgentChange: handleAgentChange,
                                onModelChange: handleLaunchModelChange,
                                onReasoningEffortChange: handleLaunchReasoningEffortChange,
                                onCodexServiceTierChange: handleCodexServiceTierChange,
                                onYoloModeChange: setYoloMode,
                                onRefreshAgentAvailability: handleRefreshAgentAvailability,
                            }}
                        />
                    </MotionStaggerItem>
                </>
            ) : (
                <MotionStaggerItem y={14}>
                    <RecoverLocalPanel {...recoverLocal.panelProps} />
                </MotionStaggerItem>
            )}

            {(error ?? spawnError) ? (
                <MotionStaggerItem y={12}>
                    <InlineNotice
                        tone={createErrorPreset.tone}
                        title={createErrorPreset.title}
                        description={error ?? spawnError ?? null}
                    />
                </MotionStaggerItem>
            ) : null}

            <MotionStaggerItem y={12}>
                <ActionButtons
                    canCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.canRecover : canCreate}
                    isDisabled={isFormDisabled || createPhase !== 'idle' || recoverLocal.isRecovering}
                    isPending={isPending || createPhase !== 'idle' || recoverLocal.isRecovering}
                    pendingLabel={pendingLabel}
                    createLabel={submitLabel}
                    onCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.handleRecover : handleCreate}
                    onCancel={props.onCancel}
                />
            </MotionStaggerItem>
        </MotionStaggerGroup>
    )
}
