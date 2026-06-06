import type { NewSessionPreferences } from './preferences'
import type { AgentType, SessionType } from './types'

export function createNewSessionPreferenceSnapshot(options: {
    agent: AgentType
    sessionType: SessionType
    yoloMode: boolean
}): NewSessionPreferences {
    return {
        agent: options.agent,
        sessionType: options.sessionType,
        yoloMode: options.yoloMode,
    }
}
