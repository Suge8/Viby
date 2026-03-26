import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { Machine } from '@/types/api'
import { InlineNotice } from '@/components/InlineNotice'
import { BlurFade } from '@/components/ui/blur-fade'
import { usePlatform } from '@/hooks/usePlatform'
import { useSpawnSession } from '@/hooks/mutations/useSpawnSession'
import { useSessions } from '@/hooks/queries/useSessions'
import { useRecentPaths } from '@/hooks/useRecentPaths'
import {
    MODEL_OPTIONS,
    REASONING_EFFORT_OPTIONS,
} from '@/lib/sessionConfigOptions'
import { getNoticePreset } from '@/lib/noticePresets'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import { useTranslation } from '@/lib/use-translation'
import type { AgentType, ModelReasoningEffortSelection, SessionRole, SessionType } from './types'
import { ActionButtons } from './ActionButtons'
import { DirectorySection } from './DirectorySection'
import { MachineSelector } from './MachineSelector'
import { NewSessionLaunchPanel } from './NewSessionLaunchPanel'
import {
    getDefaultAgentLaunchPreferences,
    loadNewSessionPreferences,
    saveNewSessionPreferences,
} from './preferences'
import { SessionTypeSelector } from './SessionTypeSelector'
import { resolveLaunchPermissionMode } from './launchConfig'
import { useNewSessionDirectoryState } from './useNewSessionDirectoryState'
import { formatRunnerSpawnError } from '../../utils/formatRunnerSpawnError'

export function NewSession(props: {
    api: ApiClient
    machines: Machine[]
    isLoading?: boolean
    onSuccess: (sessionId: string) => void
    onCancel: () => void
}) {
    const { haptic } = usePlatform()
    const { t } = useTranslation()
    const runnerErrorPreset = getNoticePreset('newSessionRunnerError', t)
    const createErrorPreset = getNoticePreset('newSessionCreateError', t)
    const { spawnSession, isPending, error: spawnError } = useSpawnSession(props.api)
    const { sessions } = useSessions(props.api)
    const isFormDisabled = Boolean(isPending || props.isLoading)
    const { getRecentPaths, addRecentPath, getLastUsedMachineId, setLastUsedMachineId } = useRecentPaths()
    const initialPreferencesRef = useRef(loadNewSessionPreferences())
    const initialPreferences = initialPreferencesRef.current
    const initialAgentPreferences = initialPreferences.agentSettings[initialPreferences.agent]
        ?? getDefaultAgentLaunchPreferences(initialPreferences.agent)

    const [agentSettings, setAgentSettings] = useState(initialPreferences.agentSettings)
    const [agent, setAgent] = useState<AgentType>(initialPreferences.agent)
    const [sessionRole, setSessionRole] = useState<SessionRole>(initialPreferences.sessionRole)
    const [model, setModel] = useState(initialAgentPreferences.model)
    const [modelReasoningEffort, setModelReasoningEffort] = useState<ModelReasoningEffortSelection>(initialAgentPreferences.modelReasoningEffort)
    const [yoloMode, setYoloMode] = useState(initialPreferences.yoloMode)
    const [sessionType, setSessionType] = useState<SessionType>(initialPreferences.sessionType)
    const [worktreeName, setWorktreeName] = useState('')
    const [error, setError] = useState<string | null>(null)
    const worktreeInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    const {
        createLabel,
        directorySectionProps,
        checkPathsExists,
        confirmDirectoryCreation,
        directoryCreationConfirmed,
        handleMachineChange,
        missingWorktreeDirectory,
        selectedMachine,
        selectedMachineId,
        trimmedDirectory,
    } = useNewSessionDirectoryState({
        api: props.api,
        machines: props.machines,
        sessions,
        isDisabled: isFormDisabled,
        sessionType,
        t,
        getRecentPaths,
        getLastUsedMachineId
    })
    const runnerSpawnError = useMemo(
        () => formatRunnerSpawnError(selectedMachine),
        [selectedMachine]
    )

    const updateAgentSetting = useCallback((targetAgent: AgentType, nextValues: Partial<{
        model: string
        modelReasoningEffort: ModelReasoningEffortSelection
    }>) => {
        setAgentSettings((previousSettings) => ({
            ...previousSettings,
            [targetAgent]: {
                ...(previousSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent)),
                ...nextValues,
            }
        }))
    }, [])

    const handleAgentChange = useCallback((nextAgent: AgentType) => {
        const nextAgentPreferences = agentSettings[nextAgent] ?? getDefaultAgentLaunchPreferences(nextAgent)
        setAgent(nextAgent)
        setModel(nextAgentPreferences.model)
        setModelReasoningEffort(nextAgentPreferences.modelReasoningEffort)
    }, [agentSettings])

    const handleModelChange = useCallback((nextModel: string) => {
        setModel(nextModel)
        updateAgentSetting(agent, { model: nextModel })
    }, [agent, updateAgentSetting])

    const handleReasoningEffortChange = useCallback((nextValue: ModelReasoningEffortSelection) => {
        setModelReasoningEffort(nextValue)
        updateAgentSetting(agent, { modelReasoningEffort: nextValue })
    }, [agent, updateAgentSetting])

    async function handleCreate() {
        if (!selectedMachineId || !trimmedDirectory) return

        setError(null)
        try {
            const existsResult = await checkPathsExists([trimmedDirectory])
            const directoryExists = existsResult[trimmedDirectory]

            if (sessionType === 'worktree' && directoryExists === false) {
                haptic.notification('error')
                setError(t('session.directoryMissingWorktree'))
                return
            }

            if (sessionType === 'simple' && directoryExists === false && !directoryCreationConfirmed) {
                confirmDirectoryCreation()
                return
            }

            const resolvedModel = model !== 'auto' && agent !== 'opencode' ? model : undefined
            const resolvedModelReasoningEffort = modelReasoningEffort !== 'default'
                ? modelReasoningEffort
                : undefined
            const resolvedPermissionMode = resolveLaunchPermissionMode(agent, yoloMode)
            const result = await spawnSession({
                machineId: selectedMachineId,
                directory: trimmedDirectory,
                agent,
                sessionRole,
                model: resolvedModel,
                modelReasoningEffort: resolvedModelReasoningEffort,
                permissionMode: resolvedPermissionMode,
                sessionType,
                worktreeName: sessionType === 'worktree' ? (worktreeName.trim() || undefined) : undefined
            })

            if (result.type === 'success') {
                haptic.notification('success')
                setLastUsedMachineId(selectedMachineId)
                addRecentPath(selectedMachineId, trimmedDirectory)
                saveNewSessionPreferences({
                    agent,
                    sessionRole,
                    sessionType,
                    yoloMode,
                    agentSettings: {
                        ...agentSettings,
                        [agent]: {
                            model,
                            modelReasoningEffort,
                        }
                    }
                })
                props.onSuccess(result.session.id)
                return
            }

            haptic.notification('error')
            setError(formatUserFacingErrorMessage(result.message, {
                t,
                fallbackKey: 'error.session.create'
            }))
        } catch (e) {
            haptic.notification('error')
            setError(formatUserFacingErrorMessage(e, {
                t,
                fallbackKey: 'error.session.create'
            }))
        }
    }

    const canCreate = Boolean(selectedMachineId && trimmedDirectory && !isFormDisabled && !missingWorktreeDirectory)
    const modelOptions = MODEL_OPTIONS[agent]
    const reasoningOptions = REASONING_EFFORT_OPTIONS[agent]
    return (
        <div className="flex flex-col gap-4 pb-8 pt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-4">
                    <BlurFade delay={0.02}>
                        <MachineSelector
                            machines={props.machines}
                            machineId={selectedMachineId}
                            isLoading={props.isLoading}
                            isDisabled={isFormDisabled}
                            onChange={handleMachineChange}
                        />
                    </BlurFade>

                    {runnerSpawnError ? (
                        <InlineNotice
                            tone={runnerErrorPreset.tone}
                            title={runnerErrorPreset.title}
                            description={t('newSession.machine.lastError', { error: runnerSpawnError })}
                            className="shadow-none"
                        />
                    ) : null}

                    <BlurFade delay={0.08}>
                        <DirectorySection {...directorySectionProps} />
                    </BlurFade>

                    <BlurFade delay={0.14}>
                        <SessionTypeSelector
                            sessionType={sessionType}
                            worktreeName={worktreeName}
                            worktreeInputRef={worktreeInputRef}
                            isDisabled={isFormDisabled}
                            onSessionTypeChange={setSessionType}
                            onWorktreeNameChange={setWorktreeName}
                        />
                    </BlurFade>
                </div>

                <BlurFade delay={0.06} className="xl:sticky xl:top-5 xl:self-start">
                    <NewSessionLaunchPanel
                        form={{
                            agent,
                            sessionRole,
                            model,
                            modelReasoningEffort,
                            yoloMode
                        }}
                        options={{
                            modelOptions,
                            reasoningOptions,
                            isDisabled: isFormDisabled
                        }}
                        handlers={{
                            onAgentChange: handleAgentChange,
                            onSessionRoleChange: setSessionRole,
                            onModelChange: handleModelChange,
                            onReasoningEffortChange: handleReasoningEffortChange,
                            onYoloModeChange: setYoloMode
                        }}
                    />
                </BlurFade>
            </div>

            {(error ?? spawnError) ? (
                <InlineNotice
                    tone={createErrorPreset.tone}
                    title={createErrorPreset.title}
                    description={error ?? spawnError}
                    className="shadow-none"
                />
            ) : null}

            <ActionButtons
                isPending={isPending}
                canCreate={canCreate}
                isDisabled={isFormDisabled}
                createLabel={createLabel}
                onCancel={props.onCancel}
                onCreate={handleCreate}
            />
        </div>
    )
}
