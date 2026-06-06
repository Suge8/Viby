import type { AgentType, ModelReasoningEffortSelection } from './types'

export type NewSessionStartBlockReason =
    | 'noDirectory'
    | 'missingWorktree'
    | 'detectingAgents'
    | 'detectingModelConfig'
    | 'modelConfigUnavailable'
    | 'noReadyAgent'

export const NEW_SESSION_START_BLOCK_REASON_KEY: Record<NewSessionStartBlockReason, string> = {
    noDirectory: 'newSession.disabled.noDirectory',
    missingWorktree: 'newSession.disabled.missingWorktree',
    detectingAgents: 'newSession.disabled.detectingAgents',
    detectingModelConfig: 'newSession.disabled.detectingModelConfig',
    modelConfigUnavailable: 'newSession.disabled.modelConfigUnavailable',
    noReadyAgent: 'newSession.disabled.noReadyAgent',
}

type StartReadinessOptions = {
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    hasDirectory: boolean
    missingWorktreeDirectory: boolean
    agentAvailabilityLoading: boolean
    launchConfigBusy: boolean
    launchConfigUnavailable: boolean
    agentReady: boolean
}

export function getNewSessionStartBlockReason(options: StartReadinessOptions): NewSessionStartBlockReason | null {
    if (!options.hasDirectory) return 'noDirectory'
    if (options.missingWorktreeDirectory) return 'missingWorktree'
    if (options.agentAvailabilityLoading || options.launchConfigBusy) return 'detectingAgents'
    if (options.launchConfigUnavailable) return 'modelConfigUnavailable'
    if (!options.agentReady || !options.model) return 'noReadyAgent'
    return null
}
