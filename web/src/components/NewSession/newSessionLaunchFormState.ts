import { createNewSessionPreferenceSnapshot } from './newSessionPreferenceSnapshot'
import { loadNewSessionPreferences, saveNewSessionPreferencesDraft } from './preferences'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection, SessionType } from './types'

export type NewSessionLaunchFormState = {
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
    return {
        agent: initialPreferences.agent,
        model: '',
        modelReasoningEffort: null,
        codexServiceTier: 'standard',
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
        })
    )
}
