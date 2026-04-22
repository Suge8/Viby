import { type AgentAvailability, getAgentSupportLink } from '@viby/protocol'
import { memo, useMemo } from 'react'
import { FeatureRocketIcon as RocketIcon } from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { Button } from '@/components/ui/button'
import { PressableSurface, PressableSurfaceSelectionIndicator } from '@/components/ui/pressable-surface'
import { getSessionAgentLabel } from '@/lib/sessionAgentLabel'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { AgentType } from './types'

type AgentPickerProps = {
    agent: AgentType
    savedAgent: AgentType
    savedAgentAvailability?: AgentAvailability | null
    hasAgentFallback: boolean
    isDisabled: boolean
    availability: readonly AgentAvailability[]
    availabilityLoading: boolean
    availabilityError?: string | null
    onAgentChange: (agent: AgentType) => void
    onRefresh: () => void
}

const AGENT_OPTIONS: Array<{ value: AgentType; accentClassName: string }> = [
    { value: 'claude', accentClassName: 'text-[var(--ds-accent-coral)]' },
    { value: 'codex', accentClassName: 'text-[var(--ds-accent-lime)]' },
    { value: 'copilot', accentClassName: 'text-[var(--ds-accent-blue)]' },
    { value: 'cursor', accentClassName: 'text-[var(--ds-accent-violet)]' },
    { value: 'gemini', accentClassName: 'text-[var(--ds-accent-gold)]' },
    { value: 'opencode', accentClassName: 'text-[var(--ds-text-primary)]' },
    { value: 'pi', accentClassName: 'text-[var(--ds-accent-gold)]' },
]

function getAvailabilityLabel(
    availability: AgentAvailability | null | undefined,
    t: (key: string, params?: Record<string, string | number>) => string
): string {
    if (!availability) {
        return t('newSession.agentAvailability.status.unknown')
    }

    return t(`newSession.agentAvailability.status.${availability.status}`)
}

function AgentPickerNotice(
    props: Pick<AgentPickerProps, 'savedAgent' | 'savedAgentAvailability' | 'hasAgentFallback'>
): React.JSX.Element | null {
    const { t } = useTranslation()

    if (!props.savedAgentAvailability || props.savedAgentAvailability.status === 'ready') {
        return null
    }

    const status = getAvailabilityLabel(props.savedAgentAvailability, t)
    const descriptionKey = props.hasAgentFallback
        ? 'newSession.agentAvailability.fallbackDescription'
        : 'newSession.agentAvailability.selectedUnavailableDescription'

    return (
        <InlineNotice
            tone="warning"
            title={t('newSession.agentAvailability.selectedUnavailableTitle')}
            description={t(descriptionKey, {
                agent: getSessionAgentLabel(props.savedAgent),
                status,
            })}
            className="mb-3 shadow-none"
        />
    )
}

function renderAgentCard(
    option: (typeof AGENT_OPTIONS)[number],
    checked: boolean,
    availability: AgentAvailability | undefined,
    isDisabled: boolean,
    onAgentChange: (agent: AgentType) => void,
    t: (key: string, params?: Record<string, string | number>) => string
): React.JSX.Element {
    const isAvailable = availability?.status === 'ready'
    const ctaHref = availability ? getAgentSupportLink(option.value, availability.resolution) : null
    const statusLabel = getAvailabilityLabel(availability, t)

    const content = (
        <>
            <span
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)]',
                    option.accentClassName,
                    !isAvailable ? 'opacity-60 saturate-0' : ''
                )}
            >
                <SessionAgentBrandIcon driver={option.value} className="h-5.5 w-5.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <span className="flex w-full items-center gap-2">
                    <span
                        className={cn(
                            'truncate text-sm font-semibold capitalize text-[var(--ds-text-primary)]',
                            !isAvailable ? 'text-[var(--ds-text-secondary)]' : ''
                        )}
                    >
                        {getSessionAgentLabel(option.value)}
                    </span>
                    <PressableSurfaceSelectionIndicator selected={checked} />
                </span>
                <span className="text-xs leading-5 text-[var(--ds-text-secondary)]">{statusLabel}</span>
                {!isAvailable && ctaHref ? (
                    <Button asChild variant="ghost" size="sm" className="-ml-2 h-auto min-h-0 px-2 py-1">
                        <a href={ctaHref} target="_blank" rel="noreferrer">
                            {t(`newSession.agentAvailability.action.${availability?.resolution ?? 'learn_more'}`)}
                        </a>
                    </Button>
                ) : null}
            </span>
        </>
    )

    if (isAvailable) {
        return (
            <PressableSurface
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                selected={checked}
                density="compact"
                disabled={isDisabled}
                className={cn(
                    'gap-3',
                    checked ? 'ring-1 ring-[color:color-mix(in_srgb,var(--ds-brand)_10%,transparent)]' : ''
                )}
                onClick={() => onAgentChange(option.value)}
            >
                {content}
            </PressableSurface>
        )
    }

    return (
        <div
            key={option.value}
            role="radio"
            aria-checked={checked}
            aria-disabled="true"
            className={cn(
                'ds-pressable-surface flex gap-3 rounded-[calc(var(--ds-radius-card)-2px)] border px-3 py-2.5 text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]',
                checked
                    ? 'border-[color:color-mix(in_srgb,var(--ds-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-warning)_8%,var(--ds-panel-strong))]'
                    : 'border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)]'
            )}
        >
            {content}
        </div>
    )
}

function NewSessionAgentPickerComponent(props: AgentPickerProps): React.JSX.Element {
    const { t } = useTranslation()
    const availabilityByDriver = useMemo(
        () => new Map(props.availability.map((entry) => [entry.driver, entry])),
        [props.availability]
    )

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="ds-launch-section-heading">
                    <span className="flex h-5 w-5 items-center justify-center">
                        <RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />
                    </span>
                    <span>{t('newSession.agent')}</span>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={props.onRefresh} disabled={props.isDisabled}>
                    {props.availabilityLoading
                        ? t('newSession.agentAvailability.refreshing')
                        : t('newSession.agentAvailability.refresh')}
                </Button>
            </div>
            <p className="mb-3 text-xs leading-5 text-[var(--ds-text-secondary)]">
                {t('newSession.agentAvailability.helper')}
            </p>
            {props.availabilityError ? (
                <InlineNotice
                    tone="warning"
                    title={t('newSession.agentAvailability.errorTitle')}
                    description={props.availabilityError}
                    className="mb-3 shadow-none"
                />
            ) : null}
            <AgentPickerNotice
                savedAgent={props.savedAgent}
                savedAgentAvailability={props.savedAgentAvailability}
                hasAgentFallback={props.hasAgentFallback}
            />
            <div role="radiogroup" aria-label={t('newSession.agent')} className="grid grid-cols-2 gap-2">
                {AGENT_OPTIONS.map((option) =>
                    renderAgentCard(
                        option,
                        props.agent === option.value,
                        availabilityByDriver.get(option.value),
                        props.isDisabled,
                        props.onAgentChange,
                        t
                    )
                )}
            </div>
        </div>
    )
}

export const NewSessionAgentPicker = memo(NewSessionAgentPickerComponent)
