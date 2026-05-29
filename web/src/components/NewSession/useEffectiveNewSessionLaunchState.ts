import { useCallback, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import { useRuntimeAgentAvailability } from '@/hooks/queries/useRuntimeAgentAvailability'
import {
    resolveEffectiveAgentLaunchPreferences,
    resolveEffectiveAgentSelection,
    toEffectiveModelReasoningEffort,
} from './newSessionAvailability'
import type { AgentLaunchPreferences } from './preferences'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection } from './types'

type UseEffectiveNewSessionLaunchStateOptions = {
    api: ApiClient
    directory: string
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    codexServiceTier: CodexServiceTierSelection
    getAgentLaunchPreferences: (agent: AgentType) => AgentLaunchPreferences
    setAgentModel: (agent: AgentType, model: string) => void
    setAgentModelReasoningEffort: (agent: AgentType, value: ModelReasoningEffortSelection) => void
    handleModelChange: (model: string) => void
    handleReasoningEffortChange: (value: ModelReasoningEffortSelection) => void
}

type UseEffectiveNewSessionLaunchStateResult = {
    agentAvailability: ReturnType<typeof useRuntimeAgentAvailability>['agents']
    isAgentAvailabilityLoading: boolean
    isAgentAvailabilityRefreshing: boolean
    refetchAgentAvailability: () => Promise<unknown>
    effectiveAgentSelection: ReturnType<typeof resolveEffectiveAgentSelection>
    effectiveModel: string
    effectiveReasoningEffort: ModelReasoningEffortSelection
    effectiveCodexServiceTier: CodexServiceTierSelection
    handleLaunchModelChange: (nextModel: string) => void
    handleLaunchReasoningEffortChange: (nextValue: ModelReasoningEffortSelection) => void
}

export function useEffectiveNewSessionLaunchState(
    options: UseEffectiveNewSessionLaunchStateOptions
): UseEffectiveNewSessionLaunchStateResult {
    const {
        api,
        directory,
        agent,
        model,
        modelReasoningEffort,
        codexServiceTier,
        getAgentLaunchPreferences,
        setAgentModel,
        setAgentModelReasoningEffort,
        handleModelChange,
        handleReasoningEffortChange,
    } = options
    const {
        agents: agentAvailability,
        isLoading: isAgentAvailabilityLoading,
        isRefreshing: isAgentAvailabilityRefreshing,
        refetch: refetchAgentAvailability,
    } = useRuntimeAgentAvailability(api, directory)

    const effectiveAgentSelection = useMemo(
        () => resolveEffectiveAgentSelection(agent, agentAvailability),
        [agent, agentAvailability]
    )
    const effectiveAgentPreferences = useMemo(
        () =>
            resolveEffectiveAgentLaunchPreferences(
                effectiveAgentSelection.effectiveAgent,
                agent,
                {
                    model,
                    modelReasoningEffort,
                    codexServiceTier,
                },
                getAgentLaunchPreferences
            ),
        [
            agent,
            codexServiceTier,
            effectiveAgentSelection.effectiveAgent,
            getAgentLaunchPreferences,
            model,
            modelReasoningEffort,
        ]
    )

    const handleLaunchModelChange = useCallback(
        (nextModel: string) => {
            if (effectiveAgentSelection.effectiveAgent === agent) {
                handleModelChange(nextModel)
                return
            }

            setAgentModel(effectiveAgentSelection.effectiveAgent, nextModel)
        },
        [agent, effectiveAgentSelection.effectiveAgent, handleModelChange, setAgentModel]
    )

    const handleLaunchReasoningEffortChange = useCallback(
        (nextValue: ModelReasoningEffortSelection) => {
            if (effectiveAgentSelection.effectiveAgent === agent) {
                handleReasoningEffortChange(nextValue)
                return
            }

            setAgentModelReasoningEffort(effectiveAgentSelection.effectiveAgent, nextValue)
        },
        [agent, effectiveAgentSelection.effectiveAgent, handleReasoningEffortChange, setAgentModelReasoningEffort]
    )

    return {
        agentAvailability,
        isAgentAvailabilityLoading,
        isAgentAvailabilityRefreshing,
        refetchAgentAvailability,
        effectiveAgentSelection,
        effectiveModel: effectiveAgentPreferences.model,
        effectiveReasoningEffort: toEffectiveModelReasoningEffort(effectiveAgentPreferences),
        effectiveCodexServiceTier: effectiveAgentPreferences.codexServiceTier,
        handleLaunchModelChange,
        handleLaunchReasoningEffortChange,
    }
}
