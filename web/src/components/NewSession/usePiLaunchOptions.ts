import { useEffect, useMemo } from 'react'
import type { AgentLaunchConfig } from '@/types/api'
import {
    findPiModelCapability,
    getPiLaunchModelOptions,
    getPiLaunchReasoningEffortOptions,
    MODEL_OPTIONS,
    REASONING_EFFORT_OPTIONS,
} from '@/lib/sessionConfigOptions'
import type { AgentType, ModelReasoningEffortSelection } from './types'
import { getDefaultAgentLaunchPreferences } from './preferences'

type PiAgentLaunchConfig = AgentLaunchConfig & { agent: 'pi' }

type UsePiLaunchOptionsOptions = {
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    machineId: string | null
    directory: string
    piLaunchConfig: PiAgentLaunchConfig | null
    updateAgentSetting: (targetAgent: AgentType, nextValues: Partial<{
        model: string
        modelReasoningEffort: ModelReasoningEffortSelection
    }>) => void
    setModel: (value: string) => void
    setModelReasoningEffort: (value: ModelReasoningEffortSelection) => void
}

function canNormalizePiOptions(options: UsePiLaunchOptionsOptions): boolean {
    return !(options.agent === 'pi' && options.machineId && options.directory && !options.piLaunchConfig)
}

export function usePiLaunchOptions(options: UsePiLaunchOptionsOptions): {
    modelOptions: Array<{ value: string; label: string; labelKey?: string }>
    reasoningOptions: Array<{ value: ModelReasoningEffortSelection; label: string; labelKey?: string }>
} {
    const activePiCapability = useMemo(() => {
        if (options.agent !== 'pi') {
            return null
        }

        const activeModel = options.model !== 'auto'
            ? options.model
            : (options.piLaunchConfig?.defaultModel ?? null)
        return findPiModelCapability(activeModel, options.piLaunchConfig?.availableModels)
    }, [options.agent, options.model, options.piLaunchConfig])

    const modelOptions = useMemo(() => {
        if (options.agent !== 'pi') {
            return MODEL_OPTIONS[options.agent]
        }

        const nextOptions = getPiLaunchModelOptions(options.piLaunchConfig?.availableModels)
        if (options.model === 'auto' || nextOptions.some((option) => option.value === options.model)) {
            return nextOptions
        }

        return [nextOptions[0], { value: options.model, label: options.model }, ...nextOptions.slice(1)]
    }, [options.agent, options.model, options.piLaunchConfig])

    const reasoningOptions = useMemo(() => {
        if (options.agent !== 'pi') {
            return REASONING_EFFORT_OPTIONS[options.agent]
        }

        const nextOptions = getPiLaunchReasoningEffortOptions(activePiCapability?.supportedThinkingLevels ?? null)
        if (
            options.modelReasoningEffort === 'default'
            || nextOptions.some((option) => option.value === options.modelReasoningEffort)
        ) {
            return nextOptions
        }

        return [
            nextOptions[0],
            { value: options.modelReasoningEffort, label: options.modelReasoningEffort },
            ...nextOptions.slice(1)
        ]
    }, [activePiCapability, options.agent, options.modelReasoningEffort])

    useEffect(() => {
        if (!canNormalizePiOptions(options)) {
            return
        }

        if (modelOptions.some((option) => option.value === options.model)) {
            return
        }

        const fallbackModel = modelOptions[0]?.value ?? getDefaultAgentLaunchPreferences(options.agent).model
        options.setModel(fallbackModel)
        options.updateAgentSetting(options.agent, { model: fallbackModel })
    }, [
        modelOptions,
        options.agent,
        options.directory,
        options.machineId,
        options.model,
        options.piLaunchConfig,
        options.setModel,
        options.updateAgentSetting
    ])

    useEffect(() => {
        if (!canNormalizePiOptions(options)) {
            return
        }

        if (reasoningOptions.some((option) => option.value === options.modelReasoningEffort)) {
            return
        }

        const fallbackEffort = reasoningOptions[0]?.value ?? getDefaultAgentLaunchPreferences(options.agent).modelReasoningEffort
        options.setModelReasoningEffort(fallbackEffort)
        options.updateAgentSetting(options.agent, { modelReasoningEffort: fallbackEffort })
    }, [
        options.agent,
        options.directory,
        options.machineId,
        options.modelReasoningEffort,
        options.piLaunchConfig,
        options.setModelReasoningEffort,
        options.updateAgentSetting,
        reasoningOptions
    ])

    return {
        modelOptions,
        reasoningOptions
    }
}
