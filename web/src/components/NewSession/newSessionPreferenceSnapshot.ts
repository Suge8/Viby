import type { NewSessionPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection, SessionType } from './types'

export function createNewSessionPreferenceSnapshot(options: {
    agent: AgentType
    sessionType: SessionType
    yoloMode: boolean
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    agentSettings: NewSessionPreferences['agentSettings']
}): NewSessionPreferences {
    return {
        agent: options.agent,
        sessionType: options.sessionType,
        yoloMode: options.yoloMode,
        agentSettings: {
            ...options.agentSettings,
            [options.agent]: {
                model: options.model,
                modelReasoningEffort: options.modelReasoningEffort,
            },
        },
    }
}
