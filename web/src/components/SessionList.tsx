import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { SessionListItem } from '@/components/session-list/SessionListItem'
import { areSessionListRowsEquivalent } from '@/components/session-list/sessionListRenderHelpers'
import { SessionListControls } from '@/components/session-list/SessionListControls'
import { SessionListSectionHeader } from '@/components/session-list/SessionListSectionHeader'
import type {
    SessionListSection,
    SessionListTab
} from '@/components/session-list/sessionListUtils'
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
const SESSION_LIST_SECTION_STACK_CLASS_NAME = 'flex flex-col gap-4 px-3 pb-4 pt-1'
const SESSION_LIST_ARCHIVE_STACK_CLASS_NAME = 'flex flex-col gap-2 px-3 pb-4 pt-1'
const SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME = 'flex flex-col gap-2'

type SessionListActions = {
    onSelect: (sessionId: string) => void
    onPreloadSession?: (sessionId: string) => void
    onNewSession: () => void
    onArchiveSelectedSession?: (sessionId: string) => void
}

type SessionListSelection = {
    onSelect: (sessionId: string) => void
    onPreload?: (sessionId: string) => void
    selectedSessionId?: string | null
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

type SessionListAnimatedItemProps = {
    session: SessionSummary
    hasUnseenReply: boolean
    selection: SessionListSelection
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
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
    const {
        archivedSessions,
        mainSessions,
        selectedSession,
        actionSession
    } = useMemo(() => {
        return deriveSessionListData(sessions, selectedSessionId, actionTarget.sessionId)
    }, [actionTarget.sessionId, selectedSessionId, sessions])
    const sections = useMemo(
        () => buildSessionSections(mainSessions),
        [mainSessions]
    )
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

    useEffect(() => {
        const previousSelectedSessionId = previousSelectedSessionIdRef.current
        previousSelectedSessionIdRef.current = selectedSessionId

        if (previousSelectedSessionId === selectedSessionId) {
            return
        }

        if (selectedSessionId === selectedSession?.id && selectedSession?.lifecycleState === 'archived') {
            setActiveTab('archived')
        }
    }, [selectedSession?.id, selectedSession?.lifecycleState, selectedSessionId])

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
    }, [selectedSession?.lifecycleState])

    useEffect(() => {
        if (actionTarget.sessionId && !actionSession) {
            setActionTarget(createClosedActionTarget())
        }
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
                    selection={selection}
                    hasUnseenReply={hasUnseenReply}
                    onOpenActionMenu={handleOpenActionMenu}
                    t={t}
                />
            ) : (
                <SessionArchiveView
                    sessions={archivedSessions}
                    selection={selection}
                    hasUnseenReply={hasUnseenReply}
                    onOpenActionMenu={handleOpenActionMenu}
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

function SessionMainView(props: {
    sections: readonly SessionListSection[]
    selection: SessionListSelection
    hasUnseenReply: (session: SessionSummary) => boolean
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
    t: (key: string, params?: Record<string, string | number>) => string
}): React.JSX.Element {
    if (props.sections.length === 0) {
        return (
            <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
                <SessionListEmptyState label={props.t('sessions.empty.sessions')} />
            </div>
        )
    }

    return (
        <div className={SESSION_LIST_SECTION_STACK_CLASS_NAME}>
            {props.sections.map((section) => (
                <section key={section.id} className="flex flex-col gap-2">
                    <SessionListSectionHeader
                        count={section.sessions.length}
                        label={props.t(section.titleKey)}
                    />
                    <div className={SESSION_LIST_SECTION_CARD_STACK_CLASS_NAME}>
                        {section.sessions.map((session) => (
                            <SessionListAnimatedItem
                                key={session.id}
                                session={session}
                                hasUnseenReply={props.hasUnseenReply(session)}
                                selection={props.selection}
                                onOpenActionMenu={props.onOpenActionMenu}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    )
}

function SessionArchiveView(props: {
    sessions: readonly SessionSummary[]
    selection: SessionListSelection
    hasUnseenReply: (session: SessionSummary) => boolean
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
    emptyLabel: string
}): React.JSX.Element {
    return (
        <div className={SESSION_LIST_ARCHIVE_STACK_CLASS_NAME}>
            {props.sessions.length === 0 ? (
                <SessionListEmptyState label={props.emptyLabel} />
            ) : (
                props.sessions.map((session) => (
                    <SessionListAnimatedItem
                        key={session.id}
                        session={session}
                        hasUnseenReply={props.hasUnseenReply(session)}
                        selection={props.selection}
                        onOpenActionMenu={props.onOpenActionMenu}
                    />
                ))
            )}
        </div>
    )
}

export const SessionList = memo(SessionListComponent)
SessionList.displayName = 'SessionList'

const SessionListAnimatedItem = memo(function SessionListAnimatedItem(
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

function SessionListEmptyState(props: { label: string }): React.JSX.Element {
    return (
        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--app-divider)] px-4 py-6 text-sm text-[var(--app-hint)]">
            {props.label}
        </div>
    )
}
