import type { AgentAvailability } from '@viby/protocol'
import { memo } from 'react'
import {
    FeatureBulbIcon as BulbIcon,
    FeatureControlsIcon as ControlsIcon,
    FeatureRocketIcon as RocketIcon,
} from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { AlertIcon } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { getLocalizedCodexServiceTierOptions } from '@/lib/sessionConfigPresentation'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionAgentPicker } from './NewSessionAgentPicker'
import { NewSessionChoiceField } from './NewSessionChoiceField'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection } from './types'

type LaunchOption<T extends string> = {
    value: T
    label: string
    labelKey?: string
    resolvedLabel?: string
    resolvedLabelKey?: string
}

type LaunchPanelProps = {
    form: {
        agent: AgentType
        model: string
        modelReasoningEffort: ModelReasoningEffortSelection
        codexServiceTier: CodexServiceTierSelection
        yoloMode: boolean
    }
    options: {
        modelOptions: Array<LaunchOption<string>>
        reasoningOptions: Array<LaunchOption<ModelReasoningEffortSelection>>
        isDisabled: boolean
        agentAvailability: readonly AgentAvailability[]
        agentAvailabilityLoading: boolean
        agentAvailabilityRefreshing: boolean
        agentAvailabilityError?: string | null
        savedAgent: AgentType
        savedAgentAvailability?: AgentAvailability | null
        hasAgentFallback: boolean
        agentLaunchConfigError?: string | null
    }
    handlers: {
        onAgentChange: (agent: AgentType) => void
        onModelChange: (model: string) => void
        onReasoningEffortChange: (value: ModelReasoningEffortSelection) => void
        onCodexServiceTierChange: (value: CodexServiceTierSelection) => void
        onYoloModeChange: (checked: boolean) => void
        onRefreshAgentAvailability: () => unknown
    }
}

type LaunchSectionHeadingProps = {
    icon: React.JSX.Element
    title: string
}

function LaunchSectionHeading(props: LaunchSectionHeadingProps): React.JSX.Element {
    return (
        <div className="ds-launch-section-heading">
            <span className="flex h-5 w-5 items-center justify-center">{props.icon}</span>
            <span>{props.title}</span>
        </div>
    )
}

function LaunchSelectField<T extends string>(props: {
    ariaLabel: string
    heading: React.JSX.Element
    value: T
    isDisabled: boolean
    options: Array<LaunchOption<T>>
    onChange: (value: T) => void
}): React.JSX.Element | null {
    const { t } = useTranslation()

    if (props.options.length === 0) {
        return null
    }

    const localizedOptions = props.options.map((option) => ({
        value: option.value,
        label: option.labelKey ? t(option.labelKey) : option.label,
        meta: option.resolvedLabelKey ? t(option.resolvedLabelKey) : option.resolvedLabel,
    }))

    return (
        <div>
            <div className="mb-2">{props.heading}</div>
            <NewSessionChoiceField
                ariaLabel={props.ariaLabel}
                value={props.value}
                disabled={props.isDisabled}
                triggerClassName="ds-field-control-elevated ds-launch-select-control disabled:opacity-50"
                options={localizedOptions}
                onChange={props.onChange}
            />
        </div>
    )
}

function NewSessionLaunchPanelComponent(props: LaunchPanelProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <NewSessionSectionCard
            title={t('newSession.launchSettings')}
            icon={<ControlsIcon className="h-5 w-5" />}
            accent="lime"
        >
            <div className="space-y-4">
                <NewSessionAgentPicker
                    agent={props.form.agent}
                    savedAgent={props.options.savedAgent}
                    savedAgentAvailability={props.options.savedAgentAvailability}
                    hasAgentFallback={props.options.hasAgentFallback}
                    isDisabled={props.options.isDisabled}
                    availability={props.options.agentAvailability}
                    availabilityLoading={props.options.agentAvailabilityLoading}
                    availabilityRefreshing={props.options.agentAvailabilityRefreshing}
                    availabilityError={props.options.agentAvailabilityError}
                    onAgentChange={props.handlers.onAgentChange}
                    onRefresh={props.handlers.onRefreshAgentAvailability}
                />

                <LaunchSelectField
                    ariaLabel={t('newSession.model')}
                    heading={
                        <LaunchSectionHeading
                            icon={<BulbIcon className="h-3.5 w-3.5 text-[var(--ds-accent-gold)]" />}
                            title={t('newSession.model')}
                        />
                    }
                    value={props.form.model}
                    isDisabled={props.options.isDisabled}
                    options={props.options.modelOptions}
                    onChange={props.handlers.onModelChange}
                />

                <LaunchSelectField<ModelReasoningEffortSelection>
                    ariaLabel={t('newSession.reasoningEffort')}
                    heading={
                        <LaunchSectionHeading
                            icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-violet)]" />}
                            title={t('newSession.reasoningEffort')}
                        />
                    }
                    value={props.form.modelReasoningEffort}
                    isDisabled={props.options.isDisabled}
                    options={props.options.reasoningOptions}
                    onChange={props.handlers.onReasoningEffortChange}
                />

                {props.form.agent === 'codex' ? (
                    <LaunchSelectField<CodexServiceTierSelection>
                        ariaLabel={t('newSession.codexFastMode')}
                        heading={
                            <LaunchSectionHeading
                                icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />}
                                title={t('newSession.codexFastMode')}
                            />
                        }
                        value={props.form.codexServiceTier}
                        isDisabled={props.options.isDisabled}
                        options={getLocalizedCodexServiceTierOptions(t)}
                        onChange={props.handlers.onCodexServiceTierChange}
                    />
                ) : null}

                {props.options.agentLaunchConfigError ? (
                    <InlineNotice
                        tone="warning"
                        title={t('newSession.agentLaunchConfig.errorTitle')}
                        description={props.options.agentLaunchConfigError}
                        className="shadow-none"
                    />
                ) : null}

                <label className="ds-launch-yolo-surface flex cursor-pointer items-start justify-between gap-4 rounded-3xl border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-4">
                    <div className="min-w-0">
                        <LaunchSectionHeading
                            icon={<AlertIcon className="h-3.5 w-3.5 text-[var(--ds-danger)]" />}
                            title={t('newSession.yolo')}
                        />
                        <p className="mt-1.5 text-xs leading-5 text-[var(--ds-text-secondary)]">
                            {t('newSession.yolo.helper')}
                        </p>
                    </div>
                    <Switch
                        checked={props.form.yoloMode}
                        onChange={(event) => props.handlers.onYoloModeChange(event.target.checked)}
                        disabled={props.options.isDisabled}
                        className="mt-0.5"
                        trackClassName="peer-checked:bg-[var(--ds-danger)]"
                    />
                </label>
            </div>
        </NewSessionSectionCard>
    )
}

export const NewSessionLaunchPanel = memo(NewSessionLaunchPanelComponent)
