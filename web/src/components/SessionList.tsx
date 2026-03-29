import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { SessionListControls } from '@/components/session-list/SessionListControls'
import type {
    SessionListManagerGroupState,
    SessionListRenderContext,
    SessionListSelection
} from '@/components/session-list/sessionListContracts'
import {
    SessionArchiveView,
    SessionMainView
} from '@/components/session-list/SessionListViews'
import type { SessionListTab } from '@/components/session-list/sessionListUtils'
import {
    buildSessionRows,
    buildSessionSections
} from '@/components/session-list/sessionListUtils'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { useSessionAttention } from '@/hooks/useSessionAttention'
import { useTranslation } from '@/lib/use-translation'
import {
    createClosedActionTarget,
    deriveSessionListData,
    resolveInitialActiveTab,
    useAutoExpandSelectedMemberGroup,
    useSelectedSessionTabSync,
    type ExpandedManagerGroups,
    type SessionActionTarget
} from '@/components/session-list/sessionListState'

const SESSION_LIST_ROOT_CLASS_NAME = 'mx-auto flex w-full max-w-content flex-col'
const SESSION_LIST_STICKY_CONTROLS_CLASS_NAME =
    '-mt-2 sticky top-0 z-10 px-3 pb-2'

type SessionListActions = {
    onSelect: (sessionId: string) => void
    onPreloadSession?: (sessionId: string) => void
    onNewSession: () => void
    onArchiveSelectedSession?: (sessionId: string) => void
}

type SessionListProps = {
    sessions: readonly SessionSummary[]
    api: ApiClient | null
    actions: SessionListActions
    selectedSessionId?: string | null
}

function loadSessionListActionControllerModule() {
    return import('@/components/session-list/SessionListActionController')
}

const SessionListActionController = lazy(async () => {
    const module = await loadSessionListActionControllerModule()
    return { default: module.SessionListActionController }
})

function SessionListComponent(props: SessionListProps): React.JSX.Element {
    const { t } = useTranslation()
    const { api, actions, selectedSessionId = null, sessions } = props
    const [activeTab, setActiveTab] = useState<SessionListTab>(() => resolveInitialActiveTab(sessions, selectedSessionId))
    const [actionTarget, setActionTarget] = useState<SessionActionTarget>(createClosedActionTarget)
    const [expandedManagerGroups, setExpandedManagerGroups] = useState<ExpandedManagerGroups>({})
    const {
        archivedSessions,
        mainSessions,
        selectedSession,
        actionSession
    } = useMemo(() => {
        return deriveSessionListData(sessions, selectedSessionId, actionTarget.sessionId)
    }, [actionTarget.sessionId, selectedSessionId, sessions])
    const sections = useMemo(() => buildSessionSections(mainSessions), [mainSessions])
    const archivedRows = useMemo(() => buildSessionRows(archivedSessions), [archivedSessions])
    const { hasUnseenReply } = useSessionAttention(sessions, selectedSessionId)
    const previousSelectedSessionIdRef = useRef(selectedSessionId)
    const previousSelectedLifecycleStateRef = useRef(selectedSession?.lifecycleState ?? null)
    const selection = useMemo<SessionListSelection>(() => ({
        onSelect: actions.onSelect,
        onPreload: actions.onPreloadSession,
        selectedSessionId
    }), [actions.onPreloadSession, actions.onSelect, selectedSessionId])
    const controls = useMemo(() => ([
        {
            id: 'sessions' as const,
            label: t('sessions.tab.sessions'),
            count: mainSessions.length
        },
        {
            id: 'archived' as const,
            label: t('sessions.tab.archived'),
            count: archivedSessions.length
        }
    ]), [archivedSessions.length, mainSessions.length, t])

    useSelectedSessionTabSync(
        selectedSession,
        selectedSessionId,
        setActiveTab,
        previousSelectedSessionIdRef,
        previousSelectedLifecycleStateRef
    )
    useAutoExpandSelectedMemberGroup(selectedSession, setExpandedManagerGroups)

    useEffect(() => {
        if (!actionTarget.sessionId || actionSession) {
            return
        }

        setActionTarget(createClosedActionTarget())
    }, [actionSession, actionTarget.sessionId])

    const handleOpenActionMenu = useCallback((sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => {
        void loadSessionListActionControllerModule()
        setActionTarget({
            sessionId,
            anchorPoint
        })
    }, [])

    const handleDismissActionController = useCallback(() => {
        setActionTarget(createClosedActionTarget())
    }, [])

    const handleToggleManagerGroup = useCallback((managerSessionId: string) => {
        setExpandedManagerGroups((current) => ({
            ...current,
            [managerSessionId]: !current[managerSessionId]
        }))
    }, [])
    const managerGroups = useMemo<SessionListManagerGroupState>(() => ({
        expandedManagerGroups,
        onToggleManagerGroup: handleToggleManagerGroup
    }), [expandedManagerGroups, handleToggleManagerGroup])
    const renderContext = useMemo<SessionListRenderContext>(() => ({
        selection,
        hasUnseenReply,
        onOpenActionMenu: handleOpenActionMenu
    }), [handleOpenActionMenu, hasUnseenReply, selection])

    return (
        <div className={SESSION_LIST_ROOT_CLASS_NAME}>
            <div className={SESSION_LIST_STICKY_CONTROLS_CLASS_NAME}>
                <SessionListControls
                    activeTab={activeTab}
                    createLabel={t('sessions.new')}
                    tabs={controls}
                    onChange={setActiveTab}
                    onCreate={actions.onNewSession}
                />
            </div>

            {activeTab === 'sessions' ? (
                <SessionMainView
                    sections={sections}
                    managerGroups={managerGroups}
                    renderContext={renderContext}
                    emptyLabel={t('sessions.empty.sessions')}
                    t={t}
                />
            ) : (
                <SessionArchiveView
                    rows={archivedRows}
                    managerGroups={managerGroups}
                    renderContext={renderContext}
                    emptyLabel={t('sessions.empty.archived')}
                />
            )}

            {actionSession ? (
                <Suspense fallback={null}>
                    <SessionListActionController
                        api={api}
                        session={actionSession}
                        anchorPoint={actionTarget.anchorPoint}
                        callbacks={{
                            onDismiss: handleDismissActionController,
                            onSelectSession: actions.onSelect,
                            onArchiveSelectedSession: actions.onArchiveSelectedSession
                        }}
                    />
                </Suspense>
            ) : null}
        </div>
    )
}

export const SessionList = memo(SessionListComponent)
SessionList.displayName = 'SessionList'
