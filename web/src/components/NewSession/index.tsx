import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useRuntimeAgentLaunchOptions } from '@/hooks/queries/useRuntimeAgentLaunchOptions'
import { useSessions } from '@/hooks/queries/useSessions'
import { usePlatform } from '@/hooks/usePlatform'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { LocalRuntime } from '@/types/api'
import { ActionButtons } from './ActionButtons'
import { NewSessionLaunchPanel } from './NewSessionLaunchPanel'
import { NewSessionModeSegmented } from './NewSessionModeSegmented'
import { isEffectiveAgentReady } from './newSessionAvailability'
import { type NewSessionMode } from './newSessionModes'
import { getNewSessionStartBlockReason, NEW_SESSION_START_BLOCK_REASON_KEY } from './newSessionStartReadiness'
import { RecoverLocalPanel } from './RecoverLocalPanel'
import { useAgentLaunchOptions } from './useAgentLaunchOptions'
import { useNewSessionCreateAction } from './useNewSessionCreateAction'
import { useNewSessionDirectoryState } from './useNewSessionDirectoryState'
import { useNewSessionLaunchForm } from './useNewSessionLaunchForm'
import { useRecoverLocalState } from './useRecoverLocalState'
import { WorkspaceSection } from './WorkspaceSection'

export function NewSession(props: {
    api: ApiClient
    runtime: LocalRuntime
    initialMode?: NewSessionMode
    onSuccess: (sessionId: string) => Promise<void> | void
    onCancel: () => void
}): React.JSX.Element {
    const { haptic } = usePlatform()
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
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
        handleModelChange,
        handleReasoningEffortChange,
        setYoloMode,
        setSessionType,
        setWorktreeName,
        handleAgentChange,
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
        projection: agentLaunchProjection,
        isLoading: isAgentLaunchOptionsLoading,
        isRefreshing: isAgentLaunchOptionsRefreshing,
        error: agentLaunchOptionsError,
        refetch: refetchAgentLaunchOptions,
    } = useRuntimeAgentLaunchOptions(props.api, trimmedDirectory)
    const {
        effectiveAgentSelection,
        modelOptions,
        reasoningOptions,
        selection: effectiveSelection,
        savedAgentUnavailableReason,
    } = useAgentLaunchOptions({
        projection: agentLaunchProjection,
        agent,
        model,
        modelReasoningEffort,
        setModel: handleModelChange,
        setModelReasoningEffort: handleReasoningEffortChange,
    })
    const effectiveModel = effectiveSelection.model
    const effectiveReasoningEffort = effectiveSelection.modelReasoningEffort
    const effectiveCodexServiceTier = codexServiceTier

    const lastToastedErrorRef = useRef<string | null>(null)
    useEffect(() => {
        const combined = error ?? spawnError
        if (!combined) {
            lastToastedErrorRef.current = null
            return
        }
        if (lastToastedErrorRef.current === combined) return
        lastToastedErrorRef.current = combined
        addToast({ tone: createErrorPreset.tone, title: createErrorPreset.title, description: combined })
    }, [addToast, createErrorPreset.title, createErrorPreset.tone, error, spawnError])

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
                codeMap: {
                    agent_unavailable: 'newSession.error.agentUnavailable',
                    agent_config_unavailable: 'newSession.error.agentConfigUnavailable',
                    model_unavailable: 'runtimeCapability.error.model_unavailable',
                    reasoning_unsupported: 'runtimeCapability.error.reasoning_unsupported',
                },
            }),
        [t]
    )
    const isEffectiveReady = isEffectiveAgentReady(effectiveAgentSelection, agentLaunchProjection)
    const isLaunchConfigBusy = isAgentLaunchOptionsLoading || isAgentLaunchOptionsRefreshing
    const startBlockReason = getNewSessionStartBlockReason({
        agent: effectiveAgentSelection.effectiveAgent,
        model: effectiveModel,
        modelReasoningEffort: effectiveReasoningEffort,
        hasDirectory: Boolean(trimmedDirectory),
        missingWorktreeDirectory,
        agentAvailabilityLoading: isAgentLaunchOptionsLoading,
        launchConfigBusy: isLaunchConfigBusy,
        launchConfigUnavailable: Boolean(agentLaunchOptionsError),
        agentReady: isEffectiveReady,
    })
    const startDisabledMessage = startBlockReason ? t(NEW_SESSION_START_BLOCK_REASON_KEY[startBlockReason]) : undefined
    const {
        canCreate: startActionReady,
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
        canStart: !startBlockReason,
        blockedMessage: startDisabledMessage,
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
    const canCreate = startActionReady && !isFormDisabled && createPhase === 'idle'
    const startDisabledHint =
        recoverLocal.mode === 'start' && !canCreate && createPhase === 'idle' ? startDisabledMessage : undefined
    const submitLabel = recoverLocal.mode === 'recover-local' ? recoverLocal.recoverActionLabel : createLabel
    const pendingLabel = recoverLocal.isRecovering
        ? t('newSession.recover.opening')
        : isCreateOpening
          ? t('newSession.opening')
          : undefined
    const handleRefreshAgentAvailability = useCallback((): Promise<unknown> => {
        return refetchAgentLaunchOptions()
    }, [refetchAgentLaunchOptions])

    return (
        <MotionStaggerGroup className="flex flex-col gap-2.5" delay={0.03} stagger={0.06}>
            <MotionStaggerItem y={14}>
                <NewSessionModeSegmented
                    mode={recoverLocal.mode}
                    isDisabled={isFormDisabled}
                    onModeChange={recoverLocal.setMode}
                />
            </MotionStaggerItem>

            {recoverLocal.mode === 'start' ? (
                <>
                    <MotionStaggerItem y={14}>
                        <WorkspaceSection
                            directory={directorySectionProps}
                            sessionType={sessionType}
                            worktreeName={worktreeName}
                            worktreeInputRef={worktreeInputRef}
                            isDisabled={isFormDisabled}
                            showSessionType
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
                                agentLaunchProjection,
                                agentAvailabilityLoading: isAgentLaunchOptionsLoading,
                                agentAvailabilityRefreshing: isAgentLaunchOptionsRefreshing,
                                savedAgent: agent,
                                savedAgentUnavailableReason,
                                hasAgentFallback: effectiveAgentSelection.hasFallback,
                                agentLaunchConfigLoading: isLaunchConfigBusy,
                            }}
                            handlers={{
                                onAgentChange: handleAgentChange,
                                onModelChange: handleModelChange,
                                onReasoningEffortChange: handleReasoningEffortChange,
                                onCodexServiceTierChange: handleCodexServiceTierChange,
                                onYoloModeChange: setYoloMode,
                                onRefreshAgentAvailability: handleRefreshAgentAvailability,
                            }}
                        />
                    </MotionStaggerItem>
                </>
            ) : (
                <>
                    <MotionStaggerItem y={14}>
                        <WorkspaceSection
                            directory={directorySectionProps}
                            sessionType={sessionType}
                            worktreeName={worktreeName}
                            worktreeInputRef={worktreeInputRef}
                            isDisabled={isFormDisabled}
                            showSessionType={false}
                            onSessionTypeChange={setSessionType}
                            onWorktreeNameChange={setWorktreeName}
                        />
                    </MotionStaggerItem>
                    <MotionStaggerItem y={14}>
                        <RecoverLocalPanel {...recoverLocal.panelProps} />
                    </MotionStaggerItem>
                </>
            )}

            <MotionStaggerItem y={12}>
                <ActionButtons
                    canCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.canRecover : canCreate}
                    isDisabled={isFormDisabled || createPhase !== 'idle' || recoverLocal.isRecovering}
                    isPending={isPending || createPhase !== 'idle' || recoverLocal.isRecovering}
                    pendingLabel={pendingLabel}
                    createLabel={submitLabel}
                    disabledHint={startDisabledHint}
                    onCreate={recoverLocal.mode === 'recover-local' ? recoverLocal.handleRecover : handleCreate}
                    onCancel={props.onCancel}
                />
            </MotionStaggerItem>
        </MotionStaggerGroup>
    )
}
