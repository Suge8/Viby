import type { SessionSummary } from '@/types/api'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'

export type SessionListSelection = {
    onSelect: (sessionId: string) => void
    onPreload?: (sessionId: string) => void
    selectedSessionId?: string | null
}

export type SessionListRenderContext = {
    selection: SessionListSelection
    hasUnseenReply: (session: SessionSummary) => boolean
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
}

export type SessionListManagerGroupState = {
    expandedManagerGroups: Readonly<Record<string, boolean>>
    onToggleManagerGroup: (managerSessionId: string) => void
}
