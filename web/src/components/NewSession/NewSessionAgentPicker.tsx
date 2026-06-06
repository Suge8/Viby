import {
    AGENT_FLAVORS,
    type NewSessionAgentLaunchProjection,
    type NewSessionAgentUnavailableReason,
} from '@viby/protocol'
import { memo, useMemo } from 'react'
import { InlineNotice } from '@/components/InlineNotice'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { PressableSurface } from '@/components/ui/pressable-surface'
import { getSessionAgentLabel } from '@/lib/sessionAgentLabel'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { AgentType } from './types'

type AgentPickerProps = {
    agent: AgentType
    savedAgent: AgentType
    savedAgentUnavailableReason: NewSessionAgentUnavailableReason | null
    hasAgentFallback: boolean
    isDisabled: boolean
    projection: NewSessionAgentLaunchProjection
    availabilityLoading: boolean
    availabilityRefreshing: boolean
    onAgentChange: (agent: AgentType) => void
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

const AGENT_OPTIONS = AGENT_FLAVORS.map((value) => ({ value, accentClassName: AGENT_ACCENT_CLASS_NAME[value] }))
type AgentOption = (typeof AGENT_OPTIONS)[number]
type TranslateFn = (key: string, params?: Record<string, string | number>) => string

function getUnavailableLabel(reason: NewSessionAgentUnavailableReason | null | undefined, t: TranslateFn): string {
    return t(`newSession.agentLaunch.unavailable.${reason ?? 'agent_unavailable'}`)
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
    if (!nextRadio) return
    event.preventDefault()
    nextRadio.focus()
    nextRadio.click()
}

function AgentPickerNotice(
    props: Pick<AgentPickerProps, 'savedAgent' | 'savedAgentUnavailableReason' | 'hasAgentFallback'>
): React.JSX.Element | null {
    const { t } = useTranslation()
    if (!props.savedAgentUnavailableReason) return null

    return (
        <InlineNotice
            tone="warning"
            title={t('newSession.agentAvailability.selectedUnavailableTitle')}
            description={t(
                props.hasAgentFallback
                    ? 'newSession.agentAvailability.fallbackDescription'
                    : 'newSession.agentAvailability.selectedUnavailableDescription',
                {
                    agent: getSessionAgentLabel(props.savedAgent),
                    status: getUnavailableLabel(props.savedAgentUnavailableReason, t),
                }
            )}
            className="mb-3 shadow-none"
        />
    )
}

function AgentTileBody(props: { option: AgentOption; isAvailable: boolean; agentLabel: string }): React.JSX.Element {
    return (
        <>
            <span
                className={cn(
                    'ds-agent-tile-icon',
                    props.option.accentClassName,
                    !props.isAvailable ? 'opacity-60 saturate-0' : ''
                )}
            >
                <SessionAgentBrandIcon driver={props.option.value} className="h-5 w-5" />
            </span>
            <span className={cn('ds-agent-tile-name', !props.isAvailable ? 'text-[var(--ds-text-secondary)]' : '')}>
                {props.agentLabel}
            </span>
        </>
    )
}

function AgentTile(props: {
    option: AgentOption
    checked: boolean
    unavailableReason: NewSessionAgentUnavailableReason | undefined
    isDisabled: boolean
    onAgentChange: (agent: AgentType) => void
    t: TranslateFn
}): React.JSX.Element {
    const isAvailable = !props.unavailableReason
    const agentLabel = getSessionAgentLabel(props.option.value)
    const body = <AgentTileBody option={props.option} isAvailable={isAvailable} agentLabel={agentLabel} />

    if (isAvailable) {
        return (
            <PressableSurface
                type="button"
                role="radio"
                aria-checked={props.checked}
                selected={props.checked}
                density="none"
                size="none"
                cardMode="centered-tile"
                disabled={props.isDisabled}
                className="ds-agent-tile"
                onClick={() => props.onAgentChange(props.option.value)}
            >
                {body}
            </PressableSurface>
        )
    }

    return (
        <div className="ds-agent-tile ds-agent-tile-unavailable">
            {body}
            <span className="ds-agent-tile-status">{getUnavailableLabel(props.unavailableReason, props.t)}</span>
        </div>
    )
}

function NewSessionAgentPickerComponent(props: AgentPickerProps): React.JSX.Element {
    const { t } = useTranslation()
    const selectableAgents = useMemo(
        () => new Set(props.projection.agents.map((entry) => entry.agent)),
        [props.projection]
    )
    const unavailable = props.projection.unavailable
    const hasAvailableAgent = props.projection.agents.length > 0

    return (
        <div>
            <AgentPickerNotice
                savedAgent={props.savedAgent}
                savedAgentUnavailableReason={props.savedAgentUnavailableReason}
                hasAgentFallback={props.hasAgentFallback}
            />
            <div
                role={hasAvailableAgent ? 'radiogroup' : 'group'}
                aria-label={t('newSession.agent')}
                className="ds-agent-tile-grid"
                onKeyDown={handleAgentPickerKeyDown}
            >
                {AGENT_OPTIONS.map((option) => (
                    <AgentTile
                        key={option.value}
                        option={option}
                        checked={props.agent === option.value}
                        unavailableReason={selectableAgents.has(option.value) ? undefined : unavailable[option.value]}
                        isDisabled={props.isDisabled}
                        onAgentChange={props.onAgentChange}
                        t={t}
                    />
                ))}
            </div>
        </div>
    )
}

export const NewSessionAgentPicker = memo(NewSessionAgentPickerComponent)
