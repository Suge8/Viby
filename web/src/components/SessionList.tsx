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
import { buildSessionSections } from '@/components/session-list/sessionListUtils'
import {
    DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
    type FloatingActionMenuAnchorPoint
} from '@/components/ui/FloatingActionMenu.contract'
import { useSessionAttention } from '@/hooks/useSessionAttention'
import { useTranslation } from '@/lib/use-translation'

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

type SessionActionTarget = {
    sessionId: string | null
    anchorPoint: FloatingActionMenuAnchorPoint
}

type SessionListDerivedData = {
    archivedSessions: SessionSummary[]
    mainSessions: SessionSummary[]
    selectedSession: SessionSummary | null
    actionSession: SessionSummary | null
}

function loadSessionListActionControllerModule() {
    return import('@/components/session-list/SessionListActionController')
}

const SessionListActionController = lazy(async () => {
    const module = await loadSessionListActionControllerModule()
    return { default: module.SessionListActionController }
})

function createClosedActionTarget(): SessionActionTarget {
    return {
        sessionId: null,
        anchorPoint: DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT
    }
}

function resolveInitialActiveTab(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null
): SessionListTab {
    if (!selectedSessionId) {
        return 'sessions'
    }

    const selectedSession = sessions.find((session) => session.id === selectedSessionId)
    return selectedSession?.lifecycleState === 'archived' ? 'archived' : 'sessions'
}

function deriveSessionListData(
    sessions: readonly SessionSummary[],
    selectedSessionId: string | null,
    actionSessionId: string | null
): SessionListDerivedData {
    const archivedSessions: SessionSummary[] = []
    const mainSessions: SessionSummary[] = []
    let selectedSession: SessionSummary | null = null
    let actionSession: SessionSummary | null = null

    for (const session of sessions) {
        if (session.lifecycleState === 'archived') {
            archivedSessions.push(session)
        } else {
            mainSessions.push(session)
        }

        if (session.id === selectedSessionId) {
            selectedSession = session
        }
        if (session.id === actionSessionId) {
            actionSession = session
        }
    }

    return {
        archivedSessions,
        mainSessions,
        selectedSession,
        actionSession
    }
}

function SessionListComponent(props: SessionListProps): React.JSX.Element {
    const { t } = useTranslation()
    const { api, actions, selectedSessionId = null, sessions } = props
    const [activeTab, setActiveTab] = useState<SessionListTab>(() => resolveInitialActiveTab(sessions, selectedSessionId))
    const [actionTarget, setActionTarget] = useState<SessionActionTarget>(createClosedActionTarget)
    const [expandedManagerGroups, setExpandedManagerGroups] = useState<Record<string, boolean>>({})
    const {
        archivedSessions,
        mainSessions,
        selectedSession,
        actionSession
    } = useMemo(() => {
        return deriveSessionListData(sessions, selectedSessionId, actionTarget.sessionId)
    }, [actionTarget.sessionId, selectedSessionId, sessions])
    const sections = useMemo(() => buildSessionSections(mainSessions), [mainSessions])
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
                    sessions={archivedSessions}
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

function useSelectedSessionTabSync(
    selectedSession: SessionSummary | null,
    selectedSessionId: string | null,
    setActiveTab: React.Dispatch<React.SetStateAction<SessionListTab>>,
    previousSelectedSessionIdRef: React.MutableRefObject<string | null>,
    previousSelectedLifecycleStateRef: React.MutableRefObject<SessionSummary['lifecycleState'] | null>
): void {
    useEffect(() => {
        const previousSelectedSessionId = previousSelectedSessionIdRef.current
        previousSelectedSessionIdRef.current = selectedSessionId

        if (previousSelectedSessionId === selectedSessionId) {
            return
        }

        if (selectedSessionId === selectedSession?.id && selectedSession?.lifecycleState === 'archived') {
            setActiveTab('archived')
        }
    }, [previousSelectedSessionIdRef, selectedSession, selectedSessionId, setActiveTab])

    useEffect(() => {
        const currentLifecycleState = selectedSession?.lifecycleState ?? null
        const previousLifecycleState = previousSelectedLifecycleStateRef.current

        previousSelectedLifecycleStateRef.current = currentLifecycleState

        if (previousLifecycleState !== 'archived') {
            return
        }

        if (currentLifecycleState && currentLifecycleState !== 'archived') {
            setActiveTab('sessions')
        }
    }, [previousSelectedLifecycleStateRef, selectedSession, setActiveTab])
}

function useAutoExpandSelectedMemberGroup(
    selectedSession: SessionSummary | null,
    setExpandedManagerGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
): void {
    useEffect(() => {
        if (!selectedSession || selectedSession.lifecycleState === 'archived') {
            return
        }

        if (selectedSession.team?.sessionRole !== 'member') {
            return
        }

        const managerSessionId = selectedSession.team.managerSessionId
        setExpandedManagerGroups((current) => {
            if (current[managerSessionId]) {
                return current
            }

            return {
                ...current,
                [managerSessionId]: true
            }
        })
    }, [selectedSession, setExpandedManagerGroups])
}

export const SessionList = memo(SessionListComponent)
SessionList.displayName = 'SessionList'
