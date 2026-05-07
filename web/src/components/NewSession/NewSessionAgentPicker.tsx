import { AGENT_FLAVORS, type AgentAvailability, getAgentSupportLink } from '@viby/protocol'
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
    availabilityRefreshing: boolean
    availabilityError?: string | null
    onAgentChange: (agent: AgentType) => void
    onRefresh: () => void
}

const AGENT_ACCENT_CLASS_NAME: Record<AgentType, string> = {
    claude: 'text-[var(--ds-accent-coral)]',
    codex: 'text-[var(--ds-accent-lime)]',
    copilot: 'text-[var(--ds-accent-blue)]',
    cursor: 'text-[var(--ds-accent-violet)]',
    gemini: 'text-[var(--ds-accent-gold)]',
    opencode: 'text-[var(--ds-text-primary)]',
    pi: 'text-[var(--ds-accent-gold)]',
}

const AGENT_OPTIONS = AGENT_FLAVORS.map((value) => ({
    value,
    accentClassName: AGENT_ACCENT_CLASS_NAME[value],
}))

function getAvailabilityLabel(
    availability: AgentAvailability | null | undefined,
    t: (key: string, params?: Record<string, string | number>) => string
): string {
    if (!availability) {
        return t('newSession.agentAvailability.status.unknown')
    }

    return t(`newSession.agentAvailability.status.${availability.status}`)
}

function getNextRadioIndex(key: string, currentIndex: number, lastIndex: number): number | null {
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return currentIndex === lastIndex ? 0 : currentIndex + 1
        case 'ArrowLeft':
        case 'ArrowUp':
            return currentIndex === 0 ? lastIndex : currentIndex - 1
        case 'Home':
            return 0
        case 'End':
            return lastIndex
        default:
            return null
    }
}

function handleAgentPickerKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const eventTarget = event.target as Node
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'))
    const activeIndex = radios.findIndex((radio) => radio === eventTarget || radio.contains(eventTarget))
    const nextIndex = activeIndex >= 0 ? getNextRadioIndex(event.key, activeIndex, radios.length - 1) : null
    const nextRadio = nextIndex === null ? null : radios[nextIndex]

    if (!nextRadio) {
        return
    }

    event.preventDefault()
    nextRadio.focus()
    nextRadio.click()
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
    const agentLabel = getSessionAgentLabel(option.value)
    const statusLabel = getAvailabilityLabel(availability, t)
    const actionLabel = t(`newSession.agentAvailability.action.${availability?.resolution ?? 'learn_more'}`)
    const shouldShowStatus = isAvailable || !ctaHref || availability?.resolution === 'learn_more'

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
                <span
                    className={cn(
                        'max-w-full truncate text-sm font-semibold capitalize text-[var(--ds-text-primary)]',
                        !isAvailable ? 'text-[var(--ds-text-secondary)]' : ''
                    )}
                >
                    {agentLabel}
                </span>
                {shouldShowStatus ? (
                    <span
                        className={
                            isAvailable ? 'ds-agent-status-pill' : 'text-xs leading-5 text-[var(--ds-text-secondary)]'
                        }
                    >
                        {statusLabel}
                    </span>
                ) : null}
            </span>
            {isAvailable ? (
                <PressableSurfaceSelectionIndicator selected={checked} className="ds-agent-card-control" />
            ) : ctaHref ? (
                <Button asChild variant="ghost" size="sm" className="ds-agent-card-action">
                    <a href={ctaHref} target="_blank" rel="noreferrer" aria-label={`${actionLabel} ${agentLabel}`}>
                        {actionLabel}
                    </a>
                </Button>
            ) : null}
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
                    'ds-agent-picker-card gap-3 text-left',
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
            className="ds-pressable-surface ds-agent-picker-card flex items-center gap-3 rounded-[calc(var(--ds-radius-card)-2px)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] px-3 py-2.5 text-[var(--ds-text-primary)] shadow-[var(--ds-shadow-soft)]"
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
    const availabilityBusy = props.availabilityLoading || props.availabilityRefreshing
    const hasAvailableAgent = AGENT_OPTIONS.some((option) => availabilityByDriver.get(option.value)?.status === 'ready')

    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="ds-launch-section-heading">
                    <span className="flex h-5 w-5 items-center justify-center">
                        <RocketIcon className="h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />
                    </span>
                    <span>{t('newSession.agent')}</span>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={props.onRefresh}
                    disabled={props.isDisabled || availabilityBusy}
                >
                    {availabilityBusy
                        ? t('newSession.agentAvailability.refreshing')
                        : t('newSession.agentAvailability.refresh')}
                </Button>
            </div>
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
            <div
                role={hasAvailableAgent ? 'radiogroup' : 'group'}
                aria-label={t('newSession.agent')}
                className="ds-agent-picker-grid"
                onKeyDown={handleAgentPickerKeyDown}
            >
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
