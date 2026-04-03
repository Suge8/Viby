import {
    AlertIcon,
    BrandMarkIcon,
} from '@/components/icons'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { InlineNotice } from '@/components/InlineNotice'
import {
    FeatureBulbIcon as BulbIcon,
    FeatureRocketIcon as RocketIcon,
} from '@/components/featureIcons'
import {
    PressableSurface,
    PressableSurfaceSelectionIndicator
} from '@/components/ui/pressable-surface'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import type { AgentType, ModelReasoningEffortSelection, SessionRole } from './types'
import { SessionRolePicker } from './SessionRolePicker'

type LaunchPanelProps = {
    form: {
        agent: AgentType
        sessionRole: SessionRole
        model: string
        modelReasoningEffort: ModelReasoningEffortSelection
        yoloMode: boolean
    }
    options: {
        modelOptions: Array<{ value: string; label: string; labelKey?: string }>
        reasoningOptions: Array<{ value: ModelReasoningEffortSelection; label: string; labelKey?: string }>
        isDisabled: boolean
        piLaunchConfigError?: string | null
    }
    handlers: {
        onAgentChange: (agent: AgentType) => void
        onSessionRoleChange: (sessionRole: SessionRole) => void
        onModelChange: (model: string) => void
        onReasoningEffortChange: (value: ModelReasoningEffortSelection) => void
        onYoloModeChange: (checked: boolean) => void
    }
}

type LaunchSectionHeadingProps = {
    icon: React.JSX.Element
    title: string
}

const AGENT_OPTIONS: Array<{ value: AgentType; icon: React.JSX.Element; accentClassName: string }> = [
    {
        value: 'claude',
        icon: <SessionAgentBrandIcon driver="claude" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-accent-coral)]'
    },
    {
        value: 'codex',
        icon: <SessionAgentBrandIcon driver="codex" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-accent-lime)]'
    },
    {
        value: 'cursor',
        icon: <SessionAgentBrandIcon driver="cursor" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-accent-violet)]'
    },
    {
        value: 'gemini',
        icon: <SessionAgentBrandIcon driver="gemini" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-accent-gold)]'
    },
    {
        value: 'opencode',
        icon: <SessionAgentBrandIcon driver="opencode" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-text-primary)]'
    },
    {
        value: 'pi',
        icon: <SessionAgentBrandIcon driver="pi" className="h-5.5 w-5.5" />,
        accentClassName: 'text-[var(--ds-accent-gold)]'
    },
]

function LaunchSectionHeading(props: LaunchSectionHeadingProps): React.JSX.Element {
    return (
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-text-muted)]">
            <span className="flex h-5 w-5 items-center justify-center">
                {props.icon}
            </span>
            <span>{props.title}</span>
        </div>
    )
}

function LaunchSelectField<T extends string>(props: {
    heading: React.JSX.Element
    value: T
    isDisabled: boolean
    accentClassName: string
    options: Array<{ value: T; label: string; labelKey?: string }>
    onChange: (value: T) => void
}): React.JSX.Element | null {
    const { t } = useTranslation()

    if (props.options.length === 0) {
        return null
    }

    return (
        <div>
            <div className="mb-2">
                {props.heading}
            </div>
            <select
                value={props.value}
                onChange={(event) => props.onChange(event.target.value as T)}
                disabled={props.isDisabled}
                className={cn(
                    'min-h-[50px] w-full rounded-[18px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-sm font-medium text-[var(--ds-text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--ds-border-strong)] disabled:opacity-50',
                    props.accentClassName
                )}
            >
                {props.options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.labelKey ? t(option.labelKey) : option.label}
                    </option>
                ))}
            </select>
        </div>
    )
}

function AgentPicker(props: {
    agent: AgentType
    isDisabled: boolean
    onAgentChange: (agent: AgentType) => void
}): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div>
            <div className="mb-2">
                <LaunchSectionHeading
                    icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />}
                    title={t('newSession.agent')}
                />
            </div>
            <div role="radiogroup" aria-label={t('newSession.agent')} className="grid grid-cols-2 gap-2">
                {AGENT_OPTIONS.map((option) => {
                    const checked = props.agent === option.value
                    return (
                        <PressableSurface
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            selected={checked}
                            density="compact"
                            disabled={props.isDisabled}
                            className={cn(
                                'gap-3',
                                checked ? 'ring-1 ring-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)]' : ''
                            )}
                            onClick={() => props.onAgentChange(option.value)}
                        >
                            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)]', option.accentClassName)}>
                                {option.icon}
                            </span>
                            <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="truncate text-sm font-semibold capitalize text-[var(--ds-text-primary)]">
                                    {option.value}
                                </span>
                                <PressableSurfaceSelectionIndicator selected={checked} />
                            </span>
                        </PressableSurface>
                    )
                })}
            </div>
        </div>
    )
}

export function NewSessionLaunchPanel(props: LaunchPanelProps): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <NewSessionSectionCard
            title={t('newSession.launchSettings')}
            icon={<BrandMarkIcon className="h-5 w-5" />}
            accent="lime"
        >
            <div className="space-y-4">
                <SessionRolePicker
                    sessionRole={props.form.sessionRole}
                    isDisabled={props.options.isDisabled}
                    onSessionRoleChange={props.handlers.onSessionRoleChange}
                />

                <AgentPicker
                    agent={props.form.agent}
                    isDisabled={props.options.isDisabled}
                    onAgentChange={props.handlers.onAgentChange}
                />

                <LaunchSelectField
                    heading={(
                        <LaunchSectionHeading
                            icon={<BulbIcon className="h-3.5 w-3.5 text-[var(--ds-accent-gold)]" />}
                            title={t('newSession.model')}
                        />
                    )}
                    value={props.form.model}
                    isDisabled={props.options.isDisabled}
                    accentClassName="focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-accent-gold)_18%,transparent)]"
                    options={props.options.modelOptions}
                    onChange={props.handlers.onModelChange}
                />

                <LaunchSelectField<ModelReasoningEffortSelection>
                    heading={(
                        <LaunchSectionHeading
                            icon={<RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-violet)]" />}
                            title={t('newSession.reasoningEffort')}
                        />
                    )}
                    value={props.form.modelReasoningEffort}
                    isDisabled={props.options.isDisabled}
                    accentClassName="focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-accent-violet)_18%,transparent)]"
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

                <div className="rounded-[20px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <LaunchSectionHeading
                                icon={<AlertIcon className="h-3.5 w-3.5 text-[var(--ds-danger)]" />}
                                title={t('newSession.yolo')}
                            />
                        </div>
                        <label className="relative inline-flex h-6 w-11 shrink-0 items-center">
                            <input
                                type="checkbox"
                                checked={props.form.yoloMode}
                                onChange={(event) => props.handlers.onYoloModeChange(event.target.checked)}
                                disabled={props.options.isDisabled}
                                className="peer sr-only"
                            />
                            <span className="absolute inset-0 rounded-full bg-[var(--ds-border-default)] transition-colors peer-checked:bg-[var(--ds-danger)] peer-disabled:opacity-50" />
                            <span className="absolute left-0.5 h-5 w-5 rounded-full bg-[var(--ds-panel-strong)] transition-transform peer-checked:translate-x-5 peer-disabled:opacity-50" />
                        </label>
                    </div>
                </div>
            </div>
        </NewSessionSectionCard>
    )
}
