import { memo } from 'react'
import type { SessionSummary } from '@/types/api'
import { SessionListItem } from '@/components/session-list/SessionListItem'
import type { SessionListSelection } from '@/components/session-list/sessionListContracts'
import { areSessionListRowsEquivalent } from '@/components/session-list/sessionListRenderHelpers'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'

type SessionListAnimatedItemProps = {
    session: SessionSummary
    hasUnseenReply: boolean
    selection: SessionListSelection
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
}

export const SessionListAnimatedItem = memo(function SessionListAnimatedItem(
    props: SessionListAnimatedItemProps
): React.JSX.Element {
    return (
        <SessionListItem
            session={props.session}
            hasUnseenReply={props.hasUnseenReply}
            selection={props.selection}
            onOpenActionMenu={props.onOpenActionMenu}
        />
    )
}, areSessionListAnimatedItemPropsEqual)
SessionListAnimatedItem.displayName = 'SessionListAnimatedItem'

function areSessionListAnimatedItemPropsEqual(
    previous: SessionListAnimatedItemProps,
    next: SessionListAnimatedItemProps
): boolean {
    return previous.onOpenActionMenu === next.onOpenActionMenu
        && previous.hasUnseenReply === next.hasUnseenReply
        && previous.selection.selectedSessionId === next.selection.selectedSessionId
        && previous.selection.onSelect === next.selection.onSelect
        && previous.selection.onPreload === next.selection.onPreload
        && areSessionListRowsEquivalent(previous.session, next.session)
}
