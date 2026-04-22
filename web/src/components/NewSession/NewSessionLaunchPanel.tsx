import type { AgentAvailability } from '@viby/protocol'
import { memo } from 'react'
import { FeatureBulbIcon as BulbIcon, FeatureRocketIcon as RocketIcon } from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { AlertIcon, BrandMarkIcon } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionAgentPicker } from './NewSessionAgentPicker'
import { NewSessionChoiceField } from './NewSessionChoiceField'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import type { AgentType, ModelReasoningEffortSelection } from './types'

type LaunchPanelProps = {
    form: {
        agent: AgentType
        model: string
        modelReasoningEffort: ModelReasoningEffortSelection
        yoloMode: boolean
    }
    options: {
        modelOptions: Array<{ value: string; label: string; labelKey?: string }>
        reasoningOptions: Array<{ value: ModelReasoningEffortSelection; label: string; labelKey?: string }>
        isDisabled: boolean
        agentAvailability: readonly AgentAvailability[]
        agentAvailabilityLoading: boolean
        agentAvailabilityError?: string | null
        savedAgent: AgentType
        savedAgentAvailability?: AgentAvailability | null
        hasAgentFallback: boolean
        piLaunchConfigError?: string | null
    }
    handlers: {
        onAgentChange: (agent: AgentType) => void
        onModelChange: (model: string) => void
        onReasoningEffortChange: (value: ModelReasoningEffortSelection) => void
        onYoloModeChange: (checked: boolean) => void
        onRefreshAgentAvailability: () => void
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
    options: Array<{ value: T; label: string; labelKey?: string }>
    onChange: (value: T) => void
}): React.JSX.Element | null {
    const { t } = useTranslation()

    if (props.options.length === 0) {
        return null
    }

    return (
        <div>
            <div className="mb-2">{props.heading}</div>
            <NewSessionChoiceField
                ariaLabel={props.ariaLabel}
                value={props.value}
                disabled={props.isDisabled}
                triggerClassName="ds-field-control-elevated ds-launch-select-control disabled:opacity-50"
                options={props.options.map((option) => ({
                    value: option.value,
                    label: option.labelKey ? t(option.labelKey) : option.label,
                }))}
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
            icon={<BrandMarkIcon className="h-5 w-5" />}
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

                {props.form.agent === 'pi' && props.options.piLaunchConfigError ? (
                    <InlineNotice
                        tone="warning"
                        title={t('newSession.piLaunchConfig.errorTitle')}
                        description={props.options.piLaunchConfigError}
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
