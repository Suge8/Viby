import type { NewSessionAgentLaunchProjection, NewSessionAgentUnavailableReason } from '@viby/protocol'
import { memo } from 'react'
import {
    FeatureBulbIcon as BulbIcon,
    FeatureControlsIcon as ControlsIcon,
    FeatureRefreshIcon as RefreshIcon,
    FeatureRocketIcon as RocketIcon,
} from '@/components/featureIcons'
import { AlertIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { Switch } from '@/components/ui/switch'
import { getLocalizedCodexServiceTierOptions } from '@/lib/sessionConfigPresentation'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionAgentPicker } from './NewSessionAgentPicker'
import { NewSessionChoiceField } from './NewSessionChoiceField'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import type { AgentType, CodexServiceTierSelection, ModelReasoningEffortSelection } from './types'

type ReasoningOptionValue = NonNullable<ModelReasoningEffortSelection>

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
        reasoningOptions: Array<LaunchOption<ReasoningOptionValue>>
        isDisabled: boolean
        agentLaunchProjection: NewSessionAgentLaunchProjection
        agentAvailabilityLoading: boolean
        agentAvailabilityRefreshing: boolean
        savedAgent: AgentType
        savedAgentUnavailableReason: NewSessionAgentUnavailableReason | null
        hasAgentFallback: boolean
        agentLaunchConfigLoading?: boolean
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
            <span className="flex h-4 w-4 items-center justify-center">{props.icon}</span>
            <span>{props.title}</span>
        </div>
    )
}

function LaunchSelectField<T extends string>(props: {
    ariaLabel: string
    icon: React.JSX.Element
    value: T | null
    isDisabled: boolean
    isLoading?: boolean
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
        <NewSessionChoiceField
            ariaLabel={props.ariaLabel}
            value={props.value}
            disabled={props.isDisabled}
            isLoading={props.isLoading}
            triggerClassName="ds-launch-select-control disabled:opacity-50"
            triggerIcon={props.icon}
            options={localizedOptions}
            onChange={props.onChange}
        />
    )
}

function AgentRefreshButton(props: {
    isDisabled: boolean
    isLoading: boolean
    isRefreshing: boolean
    onRefresh: () => unknown
}): React.JSX.Element {
    const { t } = useTranslation()
    const busy = props.isLoading || props.isRefreshing
    const label = busy ? t('newSession.agentAvailability.refreshing') : t('newSession.agentAvailability.refresh')
    return (
        <Button
            type="button"
            variant="ghost"
            size="iconXs"
            onClick={props.onRefresh}
            disabled={props.isDisabled || busy}
            aria-label={label}
            title={label}
        >
            <RefreshIcon className={busy ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
        </Button>
    )
}

function YoloRow(props: {
    yoloMode: boolean
    isDisabled: boolean
    onChange: (checked: boolean) => void
}): React.JSX.Element {
    const { t } = useTranslation()
    return (
        <label className="ds-launch-yolo-surface flex cursor-pointer items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
                <LaunchSectionHeading
                    icon={<AlertIcon className="h-3.5 w-3.5 text-[var(--ds-danger)]" />}
                    title={t('newSession.yolo')}
                />
                <span className="ds-launch-yolo-helper">{t('newSession.yolo.helper')}</span>
            </span>
            <Switch
                checked={props.yoloMode}
                onChange={(event) => props.onChange(event.target.checked)}
                disabled={props.isDisabled}
                trackClassName="peer-checked:bg-[var(--ds-danger)]"
            />
        </label>
    )
}

function NewSessionLaunchPanelComponent(props: LaunchPanelProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-2.5">
            <NewSessionSectionCard
                title={t('newSession.agent')}
                icon={<RocketIcon className="h-3.5 w-3.5" />}
                accent="lime"
                headerAction={
                    <AgentRefreshButton
                        isDisabled={props.options.isDisabled}
                        isLoading={props.options.agentAvailabilityLoading}
                        isRefreshing={props.options.agentAvailabilityRefreshing}
                        onRefresh={props.handlers.onRefreshAgentAvailability}
                    />
                }
            >
                <NewSessionAgentPicker
                    agent={props.form.agent}
                    savedAgent={props.options.savedAgent}
                    savedAgentUnavailableReason={props.options.savedAgentUnavailableReason}
                    hasAgentFallback={props.options.hasAgentFallback}
                    isDisabled={props.options.isDisabled}
                    projection={props.options.agentLaunchProjection}
                    availabilityLoading={props.options.agentAvailabilityLoading}
                    availabilityRefreshing={props.options.agentAvailabilityRefreshing}
                    onAgentChange={props.handlers.onAgentChange}
                />
            </NewSessionSectionCard>

            <NewSessionSectionCard
                title={t('newSession.launchSettings')}
                icon={<ControlsIcon className="h-3.5 w-3.5" />}
                accent="violet"
            >
                <div className="space-y-3">
                    <div className="ds-launch-fields-row">
                        <LaunchSelectField
                            ariaLabel={t('newSession.model')}
                            icon={<BulbIcon className="h-3.5 w-3.5 text-[var(--ds-accent-gold)]" />}
                            value={props.form.model}
                            isDisabled={props.options.isDisabled}
                            isLoading={props.options.agentLaunchConfigLoading}
                            options={props.options.modelOptions}
                            onChange={props.handlers.onModelChange}
                        />

                        <LaunchSelectField<ReasoningOptionValue>
                            ariaLabel={t('newSession.reasoningEffort')}
                            icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-violet)]" />}
                            value={props.form.modelReasoningEffort}
                            isDisabled={props.options.isDisabled}
                            isLoading={props.options.agentLaunchConfigLoading}
                            options={props.options.reasoningOptions}
                            onChange={props.handlers.onReasoningEffortChange}
                        />
                    </div>

                    <CollapsiblePanel open={props.form.agent === 'codex'}>
                        <LaunchSelectField<CodexServiceTierSelection>
                            ariaLabel={t('newSession.codexFastMode')}
                            icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />}
                            value={props.form.codexServiceTier}
                            isDisabled={props.options.isDisabled}
                            options={getLocalizedCodexServiceTierOptions(t)}
                            onChange={props.handlers.onCodexServiceTierChange}
                        />
                    </CollapsiblePanel>

                    <YoloRow
                        yoloMode={props.form.yoloMode}
                        isDisabled={props.options.isDisabled}
                        onChange={props.handlers.onYoloModeChange}
                    />
                </div>
            </NewSessionSectionCard>
        </div>
    )
}

export const NewSessionLaunchPanel = memo(NewSessionLaunchPanelComponent)
