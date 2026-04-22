import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import type { SessionSummary } from '@/types/api'

export type SessionListSelection = {
    onIntent?: (sessionId: string, source: 'focus' | 'hover' | 'press') => void
    onSelect: (sessionId: string) => void
    selectedSessionId: string | null
}

export type SessionListRenderContext = {
    selection: SessionListSelection
    hasUnseenReply: (session: SessionSummary) => boolean
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
}
