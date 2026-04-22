import { useCallback, useEffect, useRef, useState } from 'react'
import { createNewSessionPreferenceSnapshot } from './newSessionPreferenceSnapshot'
import {
    getDefaultAgentLaunchPreferences,
    loadNewSessionPreferences,
    type NewSessionPreferences,
    saveNewSessionPreferencesDraft,
} from './preferences'
import type { AgentType, ModelReasoningEffortSelection, SessionType } from './types'

type NewSessionLaunchFormState = {
    agentSettings: NewSessionPreferences['agentSettings']
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    yoloMode: boolean
    sessionType: SessionType
    worktreeName: string
}

function createInitialFormState(): NewSessionLaunchFormState {
    const initialPreferences = loadNewSessionPreferences()
    const initialAgentPreferences =
        initialPreferences.agentSettings[initialPreferences.agent] ??
        getDefaultAgentLaunchPreferences(initialPreferences.agent)

    return {
        agentSettings: initialPreferences.agentSettings,
        agent: initialPreferences.agent,
        model: initialAgentPreferences.model,
        modelReasoningEffort: initialAgentPreferences.modelReasoningEffort,
        yoloMode: initialPreferences.yoloMode,
        sessionType: initialPreferences.sessionType,
        worktreeName: '',
    }
}

function persistFormState(state: NewSessionLaunchFormState): void {
    saveNewSessionPreferencesDraft(
        createNewSessionPreferenceSnapshot({
            agent: state.agent,
            sessionType: state.sessionType,
            yoloMode: state.yoloMode,
            model: state.model,
            modelReasoningEffort: state.modelReasoningEffort,
            agentSettings: state.agentSettings,
        })
    )
}

export function useNewSessionLaunchForm() {
    const [formState, setFormState] = useState<NewSessionLaunchFormState>(() => createInitialFormState())
    const formStateRef = useRef(formState)
    const worktreeInputRef = useRef<HTMLInputElement>(null)

    formStateRef.current = formState

    const { agentSettings, agent, model, modelReasoningEffort, yoloMode, sessionType, worktreeName } = formState

    useEffect(() => {
        if (sessionType === 'worktree') {
            worktreeInputRef.current?.focus()
        }
    }, [sessionType])

    const buildPreferenceSnapshot = useCallback(
        (): NewSessionPreferences =>
            createNewSessionPreferenceSnapshot({
                agent,
                sessionType,
                yoloMode,
                model,
                modelReasoningEffort,
                agentSettings,
            }),
        [agent, agentSettings, model, modelReasoningEffort, sessionType, yoloMode]
    )

    const applyState = useCallback(
        (updater: (currentState: NewSessionLaunchFormState) => NewSessionLaunchFormState) => {
            const nextState = updater(formStateRef.current)
            persistFormState(nextState)
            formStateRef.current = nextState
            setFormState(nextState)
        },
        []
    )

    const updateAgentSetting = useCallback(
        (
            targetAgent: AgentType,
            nextValues: Partial<{
                model: string
                modelReasoningEffort: ModelReasoningEffortSelection
            }>
        ) => {
            applyState((currentState) => ({
                ...currentState,
                agentSettings: {
                    ...currentState.agentSettings,
                    [targetAgent]: {
                        ...(currentState.agentSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent)),
                        ...nextValues,
                    },
                },
            }))
        },
        [applyState]
    )

    const handleAgentChange = useCallback(
        (nextAgent: AgentType) => {
            applyState((currentState) => {
                const nextAgentPreferences =
                    currentState.agentSettings[nextAgent] ?? getDefaultAgentLaunchPreferences(nextAgent)

                return {
                    ...currentState,
                    agent: nextAgent,
                    model: nextAgentPreferences.model,
                    modelReasoningEffort: nextAgentPreferences.modelReasoningEffort,
                }
            })
        },
        [applyState]
    )

    const handleModelChange = useCallback(
        (nextModel: string) => {
            applyState((currentState) => ({
                ...currentState,
                model: nextModel,
                agentSettings: {
                    ...currentState.agentSettings,
                    [currentState.agent]: {
                        ...(currentState.agentSettings[currentState.agent] ??
                            getDefaultAgentLaunchPreferences(currentState.agent)),
                        model: nextModel,
                    },
                },
            }))
        },
        [applyState]
    )

    const handleReasoningEffortChange = useCallback(
        (nextValue: ModelReasoningEffortSelection) => {
            applyState((currentState) => ({
                ...currentState,
                modelReasoningEffort: nextValue,
                agentSettings: {
                    ...currentState.agentSettings,
                    [currentState.agent]: {
                        ...(currentState.agentSettings[currentState.agent] ??
                            getDefaultAgentLaunchPreferences(currentState.agent)),
                        modelReasoningEffort: nextValue,
                    },
                },
            }))
        },
        [applyState]
    )

    const getAgentLaunchPreferences = useCallback(
        (targetAgent: AgentType) =>
            formStateRef.current.agentSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent),
        []
    )

    const setAgentModel = useCallback(
        (targetAgent: AgentType, nextModel: string) => {
            applyState((currentState) => {
                const nextAgentSettings = {
                    ...currentState.agentSettings,
                    [targetAgent]: {
                        ...(currentState.agentSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent)),
                        model: nextModel,
                    },
                }

                return {
                    ...currentState,
                    agentSettings: nextAgentSettings,
                    ...(currentState.agent === targetAgent ? { model: nextModel } : {}),
                }
            })
        },
        [applyState]
    )

    const setAgentModelReasoningEffort = useCallback(
        (targetAgent: AgentType, nextValue: ModelReasoningEffortSelection) => {
            applyState((currentState) => {
                const nextAgentSettings = {
                    ...currentState.agentSettings,
                    [targetAgent]: {
                        ...(currentState.agentSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent)),
                        modelReasoningEffort: nextValue,
                    },
                }

                return {
                    ...currentState,
                    agentSettings: nextAgentSettings,
                    ...(currentState.agent === targetAgent ? { modelReasoningEffort: nextValue } : {}),
                }
            })
        },
        [applyState]
    )

    const buildPreferenceSnapshotFor = useCallback(
        (targetAgent: AgentType, nextModel: string, nextReasoningEffort: ModelReasoningEffortSelection) =>
            createNewSessionPreferenceSnapshot({
                agent: targetAgent,
                sessionType,
                yoloMode,
                model: nextModel,
                modelReasoningEffort: nextReasoningEffort,
                agentSettings: {
                    ...agentSettings,
                    [targetAgent]: {
                        ...(agentSettings[targetAgent] ?? getDefaultAgentLaunchPreferences(targetAgent)),
                        model: nextModel,
                        modelReasoningEffort: nextReasoningEffort,
                    },
                },
            }),
        [agentSettings, sessionType, yoloMode]
    )

    function setModel(nextModel: string): void {
        handleModelChange(nextModel)
    }

    function setModelReasoningEffort(nextValue: ModelReasoningEffortSelection): void {
        handleReasoningEffortChange(nextValue)
    }

    function setYoloMode(nextYoloMode: boolean): void {
        applyState((currentState) => ({
            ...currentState,
            yoloMode: nextYoloMode,
        }))
    }

    function setSessionType(nextSessionType: SessionType): void {
        applyState((currentState) => ({
            ...currentState,
            sessionType: nextSessionType,
        }))
    }

    function setWorktreeName(nextWorktreeName: string): void {
        setFormState((currentState) => ({
            ...currentState,
            worktreeName: nextWorktreeName,
        }))
    }

    return {
        agentSettings,
        agent,
        model,
        modelReasoningEffort,
        yoloMode,
        sessionType,
        worktreeName,
        worktreeInputRef,
        buildPreferenceSnapshot,
        updateAgentSetting,
        getAgentLaunchPreferences,
        setModel,
        setModelReasoningEffort,
        setAgentModel,
        setAgentModelReasoningEffort,
        setYoloMode,
        setSessionType,
        setWorktreeName,
        buildPreferenceSnapshotFor,
        handleAgentChange,
        handleModelChange,
        handleReasoningEffortChange,
    }
}
