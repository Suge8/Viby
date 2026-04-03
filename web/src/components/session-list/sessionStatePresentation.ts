import { getActiveSessionTurnState } from '@viby/protocol'
import type { SessionActivityKind, SessionLifecycleState } from '@/types/api'

export type SessionStateLabelKey =
    | 'session.state.processing'
    | 'session.state.awaitingInput'
    | 'session.state.closed'
    | 'session.state.archived'

export type SessionStateIconName = 'processing' | 'awaitingInput' | 'closed' | 'archived'

export type SessionStatePresentation = {
    badgeClassName: string
    badgeIconClassName: string
    badgeIconName: SessionStateIconName
    cardClassName: string
    iconClassName: string
    iconContainerClassName: string
    labelKey: SessionStateLabelKey
}

type SessionDisplayState = 'processing' | 'awaitingInput' | 'closed' | 'archived'

type SessionStatePresentationOptions = {
    lifecycleState: SessionLifecycleState
    thinking: boolean
    latestActivityKind: SessionActivityKind | null
    pendingRequestsCount: number
    hasUnseenReply: boolean
}

type SessionStateStatusOptions = Pick<
    SessionStatePresentationOptions,
    'lifecycleState' | 'thinking' | 'latestActivityKind' | 'pendingRequestsCount'
>

type SessionStatePalette = {
    badgeClassName: string
    badgeIconClassName: string
    badgeIconName: SessionStateIconName
    cardClassName: string
    iconClassName: string
    iconContainerClassName: string
    labelKey: SessionStateLabelKey
}

const ATTENTION_CARD_CLASS_NAME = 'shadow-[0_16px_32px_var(--app-attention-card-shadow)]'
const SESSION_STATE_PALETTES: Record<SessionDisplayState, SessionStatePalette> = {
    processing: {
        badgeClassName: 'bg-[var(--app-session-processing-badge)] text-[var(--app-session-processing-text)]',
        badgeIconClassName: 'text-[var(--app-session-processing-text)]',
        badgeIconName: 'processing',
        cardClassName: 'bg-[var(--app-session-processing-surface)] shadow-[0_12px_26px_var(--app-session-processing-shadow)]',
        iconClassName: 'text-[var(--app-session-processing-text)]',
        iconContainerClassName: 'bg-[var(--app-session-processing-icon)] text-[var(--app-session-processing-text)]',
        labelKey: 'session.state.processing'
    },
    awaitingInput: {
        badgeClassName: 'bg-[var(--app-session-awaiting-badge)] text-[var(--app-session-awaiting-text)]',
        badgeIconClassName: 'text-[var(--app-session-awaiting-text)]',
        badgeIconName: 'awaitingInput',
        cardClassName: 'bg-[var(--app-session-awaiting-surface)] shadow-[0_12px_26px_var(--app-session-awaiting-shadow)]',
        iconClassName: 'text-[var(--app-session-awaiting-text)]',
        iconContainerClassName: 'bg-[var(--app-session-awaiting-icon)] text-[var(--app-session-awaiting-text)]',
        labelKey: 'session.state.awaitingInput'
    },
    closed: {
        badgeClassName: 'bg-[var(--app-session-closed-badge)] text-[var(--app-session-closed-text)]',
        badgeIconClassName: 'text-[var(--app-session-closed-text)]',
        badgeIconName: 'closed',
        cardClassName: 'bg-[var(--app-session-closed-surface)] shadow-[0_12px_24px_var(--app-session-closed-shadow)]',
        iconClassName: 'text-[var(--app-session-closed-text)]',
        iconContainerClassName: 'bg-[var(--app-session-closed-icon)] text-[var(--app-session-closed-text)]',
        labelKey: 'session.state.closed'
    },
    archived: {
        badgeClassName: 'bg-[var(--app-session-archived-badge)] text-[var(--app-session-archived-text)]',
        badgeIconClassName: 'text-[var(--app-session-archived-text)]',
        badgeIconName: 'archived',
        cardClassName: 'bg-[var(--app-session-archived-surface)] shadow-[0_12px_24px_var(--app-session-archived-shadow)]',
        iconClassName: 'text-[var(--app-session-archived-text)]',
        iconContainerClassName: 'bg-[var(--app-session-archived-icon)] text-[var(--app-session-archived-text)]',
        labelKey: 'session.state.archived'
    }
}

export function getSessionStatePresentation(
    options: SessionStatePresentationOptions
): SessionStatePresentation {
    const displayState = getSessionDisplayState(options)
    const palette = SESSION_STATE_PALETTES[displayState]

    return {
        ...palette,
        cardClassName: getSessionCardClassName(palette.cardClassName, options.hasUnseenReply)
    }
}

function getSessionDisplayState(options: SessionStateStatusOptions): SessionDisplayState {
    if (options.lifecycleState === 'archived') {
        return 'archived'
    }

    if (options.lifecycleState === 'closed') {
        return 'closed'
    }

    return getActiveSessionTurnState(options) === 'processing'
        ? 'processing'
        : 'awaitingInput'
}

function getSessionCardClassName(cardClassName: string, hasUnseenReply: boolean): string {
    return hasUnseenReply
        ? `${cardClassName} ${ATTENTION_CARD_CLASS_NAME}`
        : cardClassName
}
