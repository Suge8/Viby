import { useCallback, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InlineNotice } from '@/components/InlineNotice'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
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
import { NewSessionModeToggle } from './NewSessionModeToggle'
import { isEffectiveAgentReady } from './newSessionAvailability'
import { type NewSessionMode } from './newSessionModes'
import { RecoverLocalPanel } from './RecoverLocalPanel'
import { SessionTypeSelector } from './SessionTypeSelector'
import { useEffectiveNewSessionLaunchState } from './useEffectiveNewSessionLaunchState'
import { useNewSessionCreateAction } from './useNewSessionCreateAction'
import { useNewSessionDirectoryState } from './useNewSessionDirectoryState'
import { useNewSessionLaunchForm } from './useNewSessionLaunchForm'
import { usePiLaunchConfig } from './usePiLaunchConfig'
import { usePiLaunchOptions } from './usePiLaunchOptions'
import { useRecoverLocalState } from './useRecoverLocalState'

export function NewSession(props: {
    api: ApiClient
    runtime: LocalRuntime
    initialMode?: NewSessionMode
    onSuccess: (sessionId: string) => void
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

    const { config: piLaunchConfig, error: piLaunchConfigError } = usePiLaunchConfig({
        api: props.api,
        agent,
        directory: trimmedDirectory,
        t,
    })

    const { modelOptions, reasoningOptions } = usePiLaunchOptions({
        agent,
        model,
        modelReasoningEffort,
        directory: trimmedDirectory,
        piLaunchConfig,
        updateAgentSetting,
        setModel,
        setModelReasoningEffort,
    })

    const {
        agentAvailability,
        isAgentAvailabilityLoading,
        agentAvailabilityError,
        refetchAgentAvailability,
        effectiveAgentSelection,
        effectiveModel,
        effectiveReasoningEffort,
        handleLaunchModelChange,
        handleLaunchReasoningEffortChange,
    } = useEffectiveNewSessionLaunchState({
        api: props.api,
        directory: trimmedDirectory,
        agent,
        model,
        modelReasoningEffort,
        getAgentLaunchPreferences,
        setAgentModel,
        setAgentModelReasoningEffort,
        handleModelChange,
        handleReasoningEffortChange,
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
    const { canCreate: hasCreateDirectory, handleCreate } = useNewSessionCreateAction({
        trimmedDirectory,
        sessionType,
        worktreeName,
        yoloMode,
        directoryCreationConfirmed,
        effectiveAgent: effectiveAgentSelection.effectiveAgent,
        effectiveModel,
        effectiveReasoningEffort,
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
    const canCreate =
        hasCreateDirectory &&
        !isFormDisabled &&
        !missingWorktreeDirectory &&
        !isAgentAvailabilityLoading &&
        isEffectiveAgentReady(effectiveAgentSelection.effectiveAgentAvailability)
    const submitLabel = recoverLocal.mode === 'recover-local' ? recoverLocal.recoverActionLabel : createLabel
    const handleRefreshAgentAvailability = useCallback((): void => {
        void refetchAgentAvailability()
    }, [refetchAgentAvailability])

    return (
        <MotionStaggerGroup className="flex flex-col gap-4 pb-8 pt-4" delay={0.03} stagger={0.09}>
            <MotionStaggerItem y={18}>
                <NewSessionModeToggle
                    mode={recoverLocal.mode}
                    isDisabled={isFormDisabled}
                    onModeChange={recoverLocal.setMode}
                />
            </MotionStaggerItem>

            <MotionStaggerItem y={20}>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <MotionStaggerGroup className="space-y-4" delay={0.02} stagger={0.08}>
                        <MotionStaggerItem x={20} y={12}>
                            <DirectorySection {...directorySectionProps} />
                        </MotionStaggerItem>

                        {recoverLocal.mode === 'start' ? (
                            <MotionStaggerItem x={-18} y={12}>
                                <SessionTypeSelector
                                    sessionType={sessionType}
                                    worktreeName={worktreeName}
                                    worktreeInputRef={worktreeInputRef}
                                    isDisabled={isFormDisabled}
                                    onSessionTypeChange={setSessionType}
                                    onWorktreeNameChange={setWorktreeName}
                                />
                            </MotionStaggerItem>
                        ) : (
                            <MotionStaggerItem x={-18} y={12}>
                                <RecoverLocalPanel {...recoverLocal.panelProps} />
                            </MotionStaggerItem>
                        )}
                    </MotionStaggerGroup>

                    {recoverLocal.mode === 'start' ? (
                        <MotionStaggerItem className="xl:sticky xl:top-5 xl:self-start" x={26} y={14} duration={0.42}>
                            <NewSessionLaunchPanel
                                form={{
                                    agent: effectiveAgentSelection.effectiveAgent,
                                    model: effectiveModel,
                                    modelReasoningEffort: effectiveReasoningEffort,
                                    yoloMode,
                                }}
                                options={{
                                    modelOptions,
                                    reasoningOptions,
                                    isDisabled: isFormDisabled,
                                    agentAvailability,
                                    agentAvailabilityLoading: isAgentAvailabilityLoading,
                                    agentAvailabilityError,
                                    savedAgent: agent,
                                    savedAgentAvailability: effectiveAgentSelection.rawAgentAvailability,
                                    hasAgentFallback: effectiveAgentSelection.hasFallback,
                                    piLaunchConfigError,
                                }}
                                handlers={{
                                    onAgentChange: handleAgentChange,
                                    onModelChange: handleLaunchModelChange,
                                    onReasoningEffortChange: handleLaunchReasoningEffortChange,
                                    onYoloModeChange: setYoloMode,
                                    onRefreshAgentAvailability: handleRefreshAgentAvailability,
                                }}
                            />
                        </MotionStaggerItem>
                    ) : null}
                </div>
            </MotionStaggerItem>

            {(error ?? spawnError) ? (
                <MotionStaggerItem y={12}>
                    <InlineNotice
                        tone={createErrorPreset.tone}
                        title={createErrorPreset.title}
                        description={error ?? spawnError ?? null}
                    />
                </MotionStaggerItem>
            ) : null}

            <MotionStaggerItem y={14}>
                <ActionButtons
                    canCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.canRecover : canCreate}
                    isDisabled={isFormDisabled || recoverLocal.isRecovering}
                    isPending={isPending || recoverLocal.isRecovering}
                    createLabel={submitLabel}
                    onCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.handleRecover : handleCreate}
                    onCancel={props.onCancel}
                />
            </MotionStaggerItem>
        </MotionStaggerGroup>
    )
}
