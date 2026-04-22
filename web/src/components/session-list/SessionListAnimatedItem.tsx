import { memo } from 'react'
import { SessionListItem } from '@/components/session-list/SessionListItem'
import type { SessionListSelection } from '@/components/session-list/sessionListContracts'
import {
    areSessionListRowsEquivalent,
    areSessionListSelectionsEquivalent,
} from '@/components/session-list/sessionListRenderHelpers'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import type { SessionSummary } from '@/types/api'

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
    return (
        previous.onOpenActionMenu === next.onOpenActionMenu &&
        previous.hasUnseenReply === next.hasUnseenReply &&
        areSessionListSelectionsEquivalent(previous.selection, next.selection) &&
        areSessionListRowsEquivalent(previous.session, next.session)
    )
}
