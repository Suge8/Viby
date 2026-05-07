import { useEffect, useMemo } from 'react'
import { findAgentModelCapability } from '@/lib/sessionConfigAgentSupport'
import {
    getAgentLaunchModelOptions,
    getAgentLaunchReasoningEffortOptions,
    getSessionModelDisplayLabelWithCapabilities,
    MODEL_OPTIONS,
    REASONING_EFFORT_OPTIONS,
} from '@/lib/sessionConfigOptions'
import type { AgentLaunchConfig } from '@/types/api'
import { getDefaultAgentLaunchPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection } from './types'

type LaunchOption<T extends string> = {
    value: T
    label: string
    labelKey?: string
    resolvedLabel?: string
    resolvedLabelKey?: string
}

type UseAgentLaunchOptionsOptions = {
    agent: AgentType
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    directory: string
    launchConfig: AgentLaunchConfig | null
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

function canNormalizeLaunchOptions(options: {
    agent: AgentType
    directory: string
    launchConfig: AgentLaunchConfig | null
}): boolean {
    return !(options.agent === 'pi' && options.directory && !options.launchConfig)
}

function getDefaultModelLabel(config: AgentLaunchConfig | null): string | undefined {
    const defaultModel = config?.defaultModel?.trim()
    if (!defaultModel) {
        return undefined
    }

    return getSessionModelDisplayLabelWithCapabilities(defaultModel, config?.agent, config?.availableModels)
}

function getDefaultReasoningOption(
    options: ReadonlyArray<LaunchOption<ModelReasoningEffortSelection>>,
    config: AgentLaunchConfig | null
): LaunchOption<ModelReasoningEffortSelection> | undefined {
    const defaultEffort = config?.defaultModelReasoningEffort
    return defaultEffort ? options.find((option) => option.value === defaultEffort) : undefined
}

function withResolvedTerminalDefault<T extends string>(
    options: ReadonlyArray<LaunchOption<T>>,
    defaultValue: T,
    resolved?: Pick<LaunchOption<T>, 'label' | 'labelKey'>
): Array<LaunchOption<T>> {
    return options.map((option) =>
        option.value === defaultValue
            ? { ...option, resolvedLabel: resolved?.label, resolvedLabelKey: resolved?.labelKey }
            : option
    )
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

function getConfiguredModelOptions(agent: AgentType, launchConfig: AgentLaunchConfig | null): LaunchOption<string>[] {
    if (!launchConfig || launchConfig.availableModels.length === 0) {
        return MODEL_OPTIONS[agent]
    }

    return getAgentLaunchModelOptions(launchConfig.availableModels)
}

function getConfiguredReasoningOptions(options: {
    agent: AgentType
    capability: ReturnType<typeof findAgentModelCapability>
}): LaunchOption<ModelReasoningEffortSelection>[] {
    const supportedEfforts = options.capability?.supportedThinkingLevels
    if (supportedEfforts && supportedEfforts.length > 0) {
        return getAgentLaunchReasoningEffortOptions(supportedEfforts)
    }

    return REASONING_EFFORT_OPTIONS[options.agent]
}

export function useAgentLaunchOptions(options: UseAgentLaunchOptionsOptions): {
    modelOptions: Array<LaunchOption<string>>
    reasoningOptions: Array<LaunchOption<ModelReasoningEffortSelection>>
} {
    const {
        agent,
        model,
        modelReasoningEffort,
        directory,
        launchConfig,
        setModel,
        setModelReasoningEffort,
        updateAgentSetting,
    } = options
    const activeCapability = useMemo(() => {
        const activeModel = model !== 'auto' ? model : (launchConfig?.defaultModel ?? null)
        return findAgentModelCapability(activeModel, launchConfig?.availableModels)
    }, [model, launchConfig])

    const modelOptions = useMemo(() => {
        const nextOptions = withResolvedTerminalDefault(getConfiguredModelOptions(agent, launchConfig), 'auto', {
            label: getDefaultModelLabel(launchConfig) ?? '',
        })
        return withCurrentLaunchOption(nextOptions, model, 'auto')
    }, [agent, model, launchConfig])

    const reasoningOptions = useMemo(() => {
        const nextOptions = getConfiguredReasoningOptions({ agent, capability: activeCapability })
        return withCurrentLaunchOption(
            withResolvedTerminalDefault(nextOptions, 'default', getDefaultReasoningOption(nextOptions, launchConfig)),
            modelReasoningEffort,
            'default'
        )
    }, [activeCapability, agent, modelReasoningEffort, launchConfig])

    useEffect(() => {
        if (
            !canNormalizeLaunchOptions({ agent, directory, launchConfig }) ||
            modelOptions.some((option) => option.value === model)
        ) {
            return
        }

        const fallbackModel = modelOptions[0]?.value ?? getDefaultAgentLaunchPreferences(agent).model
        setModel(fallbackModel)
        updateAgentSetting(agent, { model: fallbackModel })
    }, [agent, directory, launchConfig, model, modelOptions, setModel, updateAgentSetting])

    useEffect(() => {
        if (
            !canNormalizeLaunchOptions({ agent, directory, launchConfig }) ||
            reasoningOptions.some((option) => option.value === modelReasoningEffort)
        ) {
            return
        }

        const fallbackEffort =
            reasoningOptions[0]?.value ?? getDefaultAgentLaunchPreferences(agent).modelReasoningEffort
        setModelReasoningEffort(fallbackEffort)
        updateAgentSetting(agent, { modelReasoningEffort: fallbackEffort })
    }, [
        agent,
        directory,
        launchConfig,
        modelReasoningEffort,
        reasoningOptions,
        setModelReasoningEffort,
        updateAgentSetting,
    ])

    return { modelOptions, reasoningOptions }
}
