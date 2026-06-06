import { useCallback, useEffect, useRef, useState } from 'react'
import {
    createInitialLaunchFormState,
    type NewSessionLaunchFormState,
    persistLaunchFormState,
} from './newSessionLaunchFormState'
import { createNewSessionPreferenceSnapshot } from './newSessionPreferenceSnapshot'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection, SessionType } from './types'

export function useNewSessionLaunchForm() {
    const [formState, setFormState] = useState<NewSessionLaunchFormState>(() => createInitialLaunchFormState())
    const formStateRef = useRef(formState)
    const worktreeInputRef = useRef<HTMLInputElement>(null)
    formStateRef.current = formState

    const { agent, model, modelReasoningEffort, codexServiceTier, yoloMode, sessionType, worktreeName } = formState

    useEffect(() => {
        if (sessionType === 'worktree') worktreeInputRef.current?.focus()
    }, [sessionType])

    const buildPreferenceSnapshot = useCallback(
        () => createNewSessionPreferenceSnapshot({ agent, sessionType, yoloMode }),
        [agent, sessionType, yoloMode]
    )

    const applyState = useCallback(
        (updater: (currentState: NewSessionLaunchFormState) => NewSessionLaunchFormState) => {
            const nextState = updater(formStateRef.current)
            persistLaunchFormState(nextState)
            formStateRef.current = nextState
            setFormState(nextState)
        },
        []
    )

    const handleAgentChange = useCallback(
        (nextAgent: AgentType) => {
            applyState((currentState) => ({ ...currentState, agent: nextAgent, model: '', modelReasoningEffort: null }))
        },
        [applyState]
    )

    const handleModelChange = useCallback(
        (nextModel: string) => {
            applyState((currentState) => ({ ...currentState, model: nextModel }))
        },
        [applyState]
    )

    const handleReasoningEffortChange = useCallback(
        (nextValue: ModelReasoningEffortSelection) => {
            applyState((currentState) => ({ ...currentState, modelReasoningEffort: nextValue }))
        },
        [applyState]
    )

    const handleCodexServiceTierChange = useCallback(
        (nextValue: CodexServiceTierSelection) => {
            applyState((currentState) => ({ ...currentState, codexServiceTier: nextValue }))
        },
        [applyState]
    )

    function setYoloMode(nextYoloMode: boolean): void {
        applyState((currentState) => ({ ...currentState, yoloMode: nextYoloMode }))
    }

    function setSessionType(nextSessionType: SessionType): void {
        applyState((currentState) => ({ ...currentState, sessionType: nextSessionType }))
    }

    function setWorktreeName(nextWorktreeName: string): void {
        setFormState((currentState) => ({ ...currentState, worktreeName: nextWorktreeName }))
    }

    const buildPreferenceSnapshotFor = useCallback(
        (targetAgent: AgentType) => createNewSessionPreferenceSnapshot({ agent: targetAgent, sessionType, yoloMode }),
        [sessionType, yoloMode]
    )

    return {
        agent,
        model,
        modelReasoningEffort,
        codexServiceTier,
        yoloMode,
        sessionType,
        worktreeName,
        worktreeInputRef,
        buildPreferenceSnapshot,
        setYoloMode,
        setSessionType,
        setWorktreeName,
        buildPreferenceSnapshotFor,
        handleAgentChange,
        handleModelChange,
        handleReasoningEffortChange,
        handleCodexServiceTierChange,
    }
}
