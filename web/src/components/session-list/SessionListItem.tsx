import { resolveSessionDriver } from '@viby/protocol'
import { memo, useCallback, useMemo } from 'react'
import type {
    SessionSummary,
    TeamControlOwner,
    TeamMemberRecord
} from '@/types/api'
import { useLongPress } from '@/hooks/useLongPress'
import { usePlatform } from '@/hooks/usePlatform'
import { Button } from '@/components/ui/button'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { SessionAttentionBadge } from '@/components/session-list/SessionAttentionBadge'
import type { SessionListSelection } from '@/components/session-list/sessionListContracts'
import { SessionAgentBrandIcon } from '@/components/session-list/sessionAgentPresentation'
import { SessionStateBadge } from '@/components/session-list/SessionStateBadge'
import {
    getSessionListContextLabel,
    getSessionListTitle
} from '@/lib/sessionPresentation'
import { useTranslation } from '@/lib/use-translation'
import {
    formatRelativeTime,
    SESSION_ACTION_LONG_PRESS_MS
} from './sessionListUtils'
import { getSessionStatePresentation } from './sessionStatePresentation'

const SESSION_LIST_ITEM_CLASS_NAME = 'session-list-item relative w-full flex-col gap-1 overflow-hidden rounded-[var(--ds-radius-lg)] px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)] select-none transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out [&>[data-button-content]]:w-full [&>[data-button-content]]:flex-col [&>[data-button-content]]:items-stretch'
const SESSION_ICON_CLASS_NAME = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]'
const SESSION_TITLE_CLASS_NAME = 'truncate text-[15px] font-semibold leading-tight text-[var(--ds-text-primary)]'
const SESSION_METADATA_BLOCK_CLASS_NAME = 'mt-1'
const SESSION_META_ROW_CLASS_NAME = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[var(--app-hint)]'
const SESSION_TEAM_CHIP_ROW_CLASS_NAME = 'mt-2 flex flex-wrap items-center gap-1.5'
const SESSION_TEAM_CHIP_CLASS_NAME = 'inline-flex items-center rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-hint)]'
const SESSION_STATUS_ROW_CLASS_NAME = 'flex shrink-0 items-center justify-end gap-1'

type SessionListItemProps = {
    session: SessionSummary
    hasUnseenReply: boolean
    selection: SessionListSelection
    onOpenActionMenu?: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
}

export const SessionListItem = memo(function SessionListItem(props: SessionListItemProps): React.JSX.Element {
    const { t } = useTranslation()
    const { haptic } = usePlatform()
    const { session, selection, hasUnseenReply, onOpenActionMenu } = props
    const lifecycleState = session.lifecycleState
    const team = session.team
    const sessionDriver = resolveSessionDriver(session.metadata)
    const isMemberSession = team?.sessionRole === 'member'
    const selected = selection.selectedSessionId === session.id

    const longPressHandlers = useLongPress({
        onLongPress: (point) => {
            haptic.impact('medium')
            onOpenActionMenu?.(session.id, point)
        },
        onClick: () => {
            selection.onSelect(session.id)
        },
        threshold: SESSION_ACTION_LONG_PRESS_MS
    })

    const title = getSessionListTitle(session)
    const contextLabel = isMemberSession
        ? t('session.team.managerSource', { manager: getSessionListContextLabel(session) })
        : getSessionListContextLabel(session)
    const relativeTime = formatRelativeTime(session.updatedAt, t)
    const teamChips = useMemo(() => {
        if (!isMemberSession || !team) {
            return []
        }

        return [
            t(getMembershipStateLabelKey(team.membershipState)),
            t(getControlOwnerLabelKey(team.controlOwner))
        ]
    }, [isMemberSession, t, team])
    const presentation = useMemo(() => {
        return getSessionStatePresentation({
            lifecycleState,
            thinking: session.thinking,
            latestActivityKind: session.latestActivityKind,
            pendingRequestsCount: session.pendingRequestsCount,
            hasUnseenReply
        })
    }, [hasUnseenReply, lifecycleState, session.latestActivityKind, session.pendingRequestsCount, session.thinking])
    const handlePreload = useCallback(() => {
        selection.onPreload?.(session.id)
    }, [selection, session.id])

    const handlePointerEnter = useCallback<React.PointerEventHandler<HTMLButtonElement>>((event) => {
        if (event.pointerType === 'mouse') {
            handlePreload()
        }
    }, [handlePreload])

    const handlePointerDownCapture = useCallback<React.PointerEventHandler<HTMLButtonElement>>((event) => {
        if (event.pointerType === 'mouse') {
            return
        }

        handlePreload()
    }, [handlePreload])

    const cardToneClassName = getCardToneClassName(presentation.cardClassName, selected)

    return (
        <Button
            type="button"
            variant="plain"
            size="sm"
            pressStyle="card"
            {...longPressHandlers}
            onFocus={handlePreload}
            onPointerEnter={handlePointerEnter}
            onPointerDownCapture={handlePointerDownCapture}
            className={`${SESSION_LIST_ITEM_CLASS_NAME} ${cardToneClassName}`}
            style={{
                WebkitTouchCallout: 'none',
                touchAction: 'manipulation'
            }}
            aria-current={selected ? 'page' : undefined}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                    <div className={`${SESSION_ICON_CLASS_NAME} ${presentation.iconContainerClassName}`}>
                        <SessionAgentBrandIcon
                            driver={sessionDriver}
                            className={`h-6 w-6 shrink-0 ${presentation.iconClassName}`}
                        />
                    </div>
                    <div className="min-w-0">
                        <div className={SESSION_TITLE_CLASS_NAME}>
                            {title}
                        </div>
                        <div className={`${SESSION_METADATA_BLOCK_CLASS_NAME} ${SESSION_META_ROW_CLASS_NAME}`}>
                            <span className="truncate">{contextLabel}</span>
                            {relativeTime ? <span>{relativeTime}</span> : null}
                        </div>
                        {teamChips.length > 0 ? (
                            <div className={SESSION_TEAM_CHIP_ROW_CLASS_NAME}>
                                {teamChips.map((chip) => (
                                    <span key={chip} className={SESSION_TEAM_CHIP_CLASS_NAME}>
                                        {chip}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className={SESSION_STATUS_ROW_CLASS_NAME}>
                    {hasUnseenReply ? (
                        <SessionAttentionBadge compact />
                    ) : null}
                    <SessionStateBadge presentation={presentation} />
                </div>
            </div>
        </Button>
    )
})

function getCardToneClassName(cardClassName: string, selected: boolean): string {
    if (!selected) {
        return cardClassName
    }

    return `${cardClassName} ring-2 ring-[color:color-mix(in_srgb,var(--ds-brand)_18%,transparent)] shadow-[var(--ds-shadow-card)]`
}

function getMembershipStateLabelKey(membershipState: TeamMemberRecord['membershipState'] | undefined): string {
    switch (membershipState) {
        case 'archived':
            return 'session.team.membership.archived'
        case 'removed':
            return 'session.team.membership.removed'
        case 'superseded':
            return 'session.team.membership.superseded'
        default:
            return 'session.team.membership.active'
    }
}

function getControlOwnerLabelKey(controlOwner: TeamControlOwner | undefined): string {
    return controlOwner === 'user'
        ? 'session.team.control.user'
        : 'session.team.control.manager'
}
