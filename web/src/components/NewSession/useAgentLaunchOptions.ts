import {
    type NewSessionAgentLaunchProjection,
    type NewSessionAgentUnavailableReason,
    resolveAgentLaunchOptions,
} from '@viby/protocol'
import { useEffect, useMemo } from 'react'
import { resolveEffectiveAgentSelection } from './newSessionAvailability'
import type { AgentType, ModelReasoningEffortSelection } from './types'

type LaunchOption<T extends string> = { value: T; label: string }

function getUnavailableReason(
    projection: NewSessionAgentLaunchProjection,
    agent: AgentType
): NewSessionAgentUnavailableReason | null {
    return projection.unavailable[agent] ?? null
}

export function useAgentLaunchOptions(options: {
    projection: NewSessionAgentLaunchProjection
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    setModel: (value: string) => void
    setModelReasoningEffort: (value: ModelReasoningEffortSelection) => void
}): {
    effectiveAgentSelection: ReturnType<typeof resolveEffectiveAgentSelection>
    modelOptions: Array<LaunchOption<string>>
    reasoningOptions: Array<LaunchOption<NonNullable<ModelReasoningEffortSelection>>>
    selection: { model: string; modelReasoningEffort: ModelReasoningEffortSelection }
    savedAgentUnavailableReason: NewSessionAgentUnavailableReason | null
} {
    const effectiveAgentSelection = useMemo(
        () => resolveEffectiveAgentSelection(options.agent, options.projection),
        [options.agent, options.projection]
    )
    const selectableAgent = options.projection.agents.find(
        (entry) => entry.agent === effectiveAgentSelection.effectiveAgent
    )
    const launchOptions = selectableAgent
        ? resolveAgentLaunchOptions(selectableAgent, {
              model: options.model,
              modelReasoningEffort: options.modelReasoningEffort,
          })
        : { modelOptions: [], reasoningOptions: [], selection: { model: '', modelReasoningEffort: null } }

    useEffect(() => {
        if (!selectableAgent) return
        if (launchOptions.selection.model !== options.model) options.setModel(launchOptions.selection.model)
        if (launchOptions.selection.modelReasoningEffort !== options.modelReasoningEffort) {
            options.setModelReasoningEffort(launchOptions.selection.modelReasoningEffort)
        }
    }, [
        launchOptions.selection.model,
        launchOptions.selection.modelReasoningEffort,
        options.model,
        options.modelReasoningEffort,
        options.setModel,
        options.setModelReasoningEffort,
        selectableAgent,
    ])

    return {
        effectiveAgentSelection,
        modelOptions: launchOptions.modelOptions,
        reasoningOptions: launchOptions.reasoningOptions as Array<
            LaunchOption<NonNullable<ModelReasoningEffortSelection>>
        >,
        selection: launchOptions.selection,
        savedAgentUnavailableReason: getUnavailableReason(options.projection, options.agent),
    }
}
