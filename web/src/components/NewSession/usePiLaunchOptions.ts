import { useEffect, useMemo } from 'react'
import {
    getPiLaunchModelOptions,
    getPiLaunchReasoningEffortOptions,
    MODEL_OPTIONS,
    REASONING_EFFORT_OPTIONS,
} from '@/lib/sessionConfigOptions'
import { findPiModelCapability } from '@/lib/sessionConfigPiSupport'
import type { AgentLaunchConfig } from '@/types/api'
import { getDefaultAgentLaunchPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection } from './types'

type PiAgentLaunchConfig = AgentLaunchConfig & { agent: 'pi' }
type LaunchOption<T extends string> = { value: T; label: string; labelKey?: string }

type UsePiLaunchOptionsOptions = {
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    directory: string
    piLaunchConfig: PiAgentLaunchConfig | null
    updateAgentSetting: (
        targetAgent: AgentType,
        nextValues: Partial<{
            model: string
            modelReasoningEffort: ModelReasoningEffortSelection
        }>
    ) => void
    setModel: (value: string) => void
    setModelReasoningEffort: (value: ModelReasoningEffortSelection) => void
}

function canNormalizePiOptions(options: UsePiLaunchOptionsOptions): boolean {
    return !(options.agent === 'pi' && options.directory && !options.piLaunchConfig)
}

export function withCurrentLaunchOption<T extends string>(
    options: ReadonlyArray<LaunchOption<T>>,
    currentValue: T,
    defaultValue: T
): Array<LaunchOption<T>> {
    const trimmedValue = currentValue.trim() as T
    if (!trimmedValue || trimmedValue === defaultValue || options.some((option) => option.value === trimmedValue)) {
        return [...options]
    }

    const currentOption = { value: trimmedValue, label: trimmedValue }
    if (options.length === 0) {
        return [currentOption]
    }

    const [firstOption, ...restOptions] = options
    return [firstOption, currentOption, ...restOptions]
}

export function usePiLaunchOptions(options: UsePiLaunchOptionsOptions): {
    modelOptions: Array<{ value: string; label: string; labelKey?: string }>
    reasoningOptions: Array<{ value: ModelReasoningEffortSelection; label: string; labelKey?: string }>
} {
    const activePiCapability = useMemo(() => {
        if (options.agent !== 'pi') {
            return null
        }

        const activeModel = options.model !== 'auto' ? options.model : (options.piLaunchConfig?.defaultModel ?? null)
        return findPiModelCapability(activeModel, options.piLaunchConfig?.availableModels)
    }, [options.agent, options.model, options.piLaunchConfig])

    const modelOptions = useMemo(() => {
        if (options.agent !== 'pi') {
            return withCurrentLaunchOption(MODEL_OPTIONS[options.agent], options.model, 'auto')
        }

        const nextOptions = getPiLaunchModelOptions(options.piLaunchConfig?.availableModels)
        return withCurrentLaunchOption(nextOptions, options.model, 'auto')
    }, [options.agent, options.model, options.piLaunchConfig])

    const reasoningOptions = useMemo(() => {
        if (options.agent !== 'pi') {
            return withCurrentLaunchOption(
                REASONING_EFFORT_OPTIONS[options.agent],
                options.modelReasoningEffort,
                'default'
            )
        }

        const nextOptions = getPiLaunchReasoningEffortOptions(activePiCapability?.supportedThinkingLevels ?? null)
        return withCurrentLaunchOption(nextOptions, options.modelReasoningEffort, 'default')
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
        options.model,
        options.piLaunchConfig,
        options.setModel,
        options.updateAgentSetting,
    ])

    useEffect(() => {
        if (!canNormalizePiOptions(options)) {
            return
        }

        if (reasoningOptions.some((option) => option.value === options.modelReasoningEffort)) {
            return
        }

        const fallbackEffort =
            reasoningOptions[0]?.value ?? getDefaultAgentLaunchPreferences(options.agent).modelReasoningEffort
        options.setModelReasoningEffort(fallbackEffort)
        options.updateAgentSetting(options.agent, { modelReasoningEffort: fallbackEffort })
    }, [
        options.agent,
        options.directory,
        options.modelReasoningEffort,
        options.piLaunchConfig,
        options.setModelReasoningEffort,
        options.updateAgentSetting,
        reasoningOptions,
    ])

    return {
        modelOptions,
        reasoningOptions,
    }
}
