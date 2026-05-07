import { createNewSessionPreferenceSnapshot } from './newSessionPreferenceSnapshot'
import {
    getDefaultAgentLaunchPreferences,
    loadNewSessionPreferences,
    type NewSessionPreferences,
    saveNewSessionPreferencesDraft,
} from './preferences'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection, SessionType } from './types'

export type NewSessionLaunchFormState = {
    agentSettings: NewSessionPreferences['agentSettings']
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    codexServiceTier: CodexServiceTierSelection
    yoloMode: boolean
    sessionType: SessionType
    worktreeName: string
}

export function createInitialLaunchFormState(): NewSessionLaunchFormState {
    const initialPreferences = loadNewSessionPreferences()
    const initialAgentPreferences =
        initialPreferences.agentSettings[initialPreferences.agent] ??
        getDefaultAgentLaunchPreferences(initialPreferences.agent)

    return {
        agentSettings: initialPreferences.agentSettings,
        agent: initialPreferences.agent,
        model: initialAgentPreferences.model,
        modelReasoningEffort: initialAgentPreferences.modelReasoningEffort,
        codexServiceTier: initialAgentPreferences.codexServiceTier,
        yoloMode: initialPreferences.yoloMode,
        sessionType: initialPreferences.sessionType,
        worktreeName: '',
    }
}

export function persistLaunchFormState(state: NewSessionLaunchFormState): void {
    saveNewSessionPreferencesDraft(
        createNewSessionPreferenceSnapshot({
            agent: state.agent,
            sessionType: state.sessionType,
            yoloMode: state.yoloMode,
            model: state.model,
            modelReasoningEffort: state.modelReasoningEffort,
            codexServiceTier: state.codexServiceTier,
            agentSettings: state.agentSettings,
        })
    )
}
