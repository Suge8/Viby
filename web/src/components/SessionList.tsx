import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionSummary } from '@/types/api'
import type { ApiClient } from '@/api/client'
import { PlusIcon } from '@/components/icons'
import { SessionListItem } from '@/components/session-list/SessionListItem'
import {
    areSessionListRowsEquivalent,
    getSessionTabButtonClassName
} from '@/components/session-list/sessionListRenderHelpers'
import type { SessionListTab } from '@/components/session-list/sessionListUtils'
import { buildSessionSections } from '@/components/session-list/sessionListUtils'
import { Button } from '@/components/ui/button'
import {
    DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
    type FloatingActionMenuAnchorPoint
} from '@/components/ui/FloatingActionMenu'
import { useSessionAttention } from '@/hooks/useSessionAttention'
import { useTranslation } from '@/lib/use-translation'

type SessionListActions = {
    onSelect: (sessionId: string) => void
    onPreloadSession?: (sessionId: string) => void
    onNewSession: () => void
}

type SessionListSelection = {
    onSelect: (sessionId: string) => void
    onPreload?: (sessionId: string) => void
    selectedSessionId?: string | null
}

type SessionListProps = {
    sessions: SessionSummary[]
    api: ApiClient | null
    actions: SessionListActions
    selectedSessionId?: string | null
    renderHeader?: boolean
}

type SessionActionTarget = {
    sessionId: string | null
    anchorPoint: FloatingActionMenuAnchorPoint
    menuOpen: boolean
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
        anchorPoint: DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
        menuOpen: false
    }
}

function SessionListComponent(props: SessionListProps): React.JSX.Element {
    const { t } = useTranslation()
    const { api, actions, renderHeader = true, selectedSessionId = null, sessions } = props
    const [activeTab, setActiveTab] = useState<SessionListTab>('sessions')
    const [actionTarget, setActionTarget] = useState<SessionActionTarget>(createClosedActionTarget)

    const archivedSessions = useMemo(
        () => sessions.filter((session) => session.lifecycleState === 'archived'),
        [sessions]
    )
    const mainSessions = useMemo(
        () => sessions.filter((session) => session.lifecycleState !== 'archived'),
        [sessions]
    )
    const sections = useMemo(
        () => buildSessionSections(mainSessions),
        [mainSessions]
    )
    const { hasUnseenReply } = useSessionAttention(sessions, selectedSessionId)
    const selectedSession = useMemo(
        () => sessions.find((session) => session.id === selectedSessionId) ?? null,
        [selectedSessionId, sessions]
    )
    const actionSession = useMemo(() => {
        if (!actionTarget.sessionId) {
            return null
        }
        return sessions.find((session) => session.id === actionTarget.sessionId) ?? null
    }, [actionTarget.sessionId, sessions])
    const selection = useMemo<SessionListSelection>(() => ({
        onSelect: actions.onSelect,
        onPreload: actions.onPreloadSession,
        selectedSessionId
    }), [actions.onPreloadSession, actions.onSelect, selectedSessionId])

    useEffect(() => {
        if (!selectedSession?.lifecycleState) {
            return
        }

        setActiveTab(selectedSession.lifecycleState === 'archived' ? 'archived' : 'sessions')
    }, [selectedSession?.lifecycleState])

    useEffect(() => {
        if (actionTarget.sessionId && !actionSession) {
            setActionTarget((previous) => ({
                ...previous,
                sessionId: null
            }))
        }
    }, [actionSession, actionTarget.sessionId])

    const handleOpenActionMenu = useCallback((sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => {
        void loadSessionListActionControllerModule()
        setActionTarget({
            sessionId,
            anchorPoint,
            menuOpen: true
        })
    }, [])

    const handleCloseActionMenu = useCallback(() => {
        setActionTarget((previous) => ({
            ...previous,
            menuOpen: false
        }))
    }, [])

    const handleDismissActionController = useCallback(() => {
        setActionTarget(createClosedActionTarget())
    }, [])

    return (
        <div className="mx-auto flex w-full max-w-content flex-col">
            {renderHeader ? (
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="text-xs text-[var(--app-hint)]">
                        {t('sessions.summary', { open: mainSessions.length, archived: archivedSessions.length })}
                    </div>
                    <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={actions.onNewSession}
                        className="session-list-new-button h-11 w-11 text-[var(--app-link)]"
                        title={t('sessions.new')}
                    >
                        <PlusIcon className="h-5 w-5" />
                    </Button>
                </div>
            ) : null}

            <div className="px-3 pb-3">
                <div className="grid grid-cols-2 gap-2 rounded-[var(--ds-radius-lg)] border border-[var(--app-divider)] bg-[var(--ds-panel-strong)] p-1">
                    <SessionTabButton
                        active={activeTab === 'sessions'}
                        count={mainSessions.length}
                        label={t('sessions.tab.sessions')}
                        onClick={() => setActiveTab('sessions')}
                    />
                    <SessionTabButton
                        active={activeTab === 'archived'}
                        count={archivedSessions.length}
                        label={t('sessions.tab.archived')}
                        onClick={() => setActiveTab('archived')}
                    />
                </div>
            </div>

            {activeTab === 'sessions' ? (
                <div className="flex flex-col gap-4 px-3 pb-4">
                    {sections.length === 0 ? (
                        <SessionListEmptyState label={t('sessions.empty.sessions')} />
                    ) : (
                        sections.map((section) => (
                            <section key={section.id} className="flex flex-col gap-2">
                                <div className="flex items-center justify-between px-1">
                                    <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                                        {t(section.titleKey)}
                                    </h2>
                                    <span className="text-xs text-[var(--app-hint)]">
                                        {section.sessions.length}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {section.sessions.map((session) => (
                                        <SessionListAnimatedItem
                                            key={session.id}
                                            session={session}
                                            hasUnseenReply={hasUnseenReply(session)}
                                            selection={selection}
                                            onOpenActionMenu={handleOpenActionMenu}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-2 px-3 pb-4">
                    {archivedSessions.length === 0 ? (
                        <SessionListEmptyState label={t('sessions.empty.archived')} />
                    ) : (
                        archivedSessions.map((session) => (
                            <SessionListAnimatedItem
                                key={session.id}
                                session={session}
                                hasUnseenReply={hasUnseenReply(session)}
                                selection={selection}
                                onOpenActionMenu={handleOpenActionMenu}
                            />
                        ))
                    )}
                </div>
            )}

            {actionSession ? (
                <Suspense fallback={null}>
                    <SessionListActionController
                        api={api}
                        session={actionSession}
                        overlay={{
                            anchorPoint: actionTarget.anchorPoint,
                            isMenuOpen: actionTarget.menuOpen && actionTarget.sessionId === actionSession.id
                        }}
                        callbacks={{
                            onCloseMenu: handleCloseActionMenu,
                            onDismiss: handleDismissActionController,
                            onSelectSession: actions.onSelect
                        }}
                    />
                </Suspense>
            ) : null}
        </div>
    )
}

type SessionListAnimatedItemProps = {
    session: SessionSummary
    hasUnseenReply: boolean
    selection: SessionListSelection
    onOpenActionMenu: (sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => void
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

const SessionTabButton = memo(function SessionTabButton(props: {
    active: boolean
    count: number
    label: string
    onClick: () => void
}): React.JSX.Element {
    return (
        <Button
            type="button"
            size="sm"
            variant={props.active ? 'secondary' : 'ghost'}
            onClick={props.onClick}
            className={getSessionTabButtonClassName(props.active)}
        >
            <span>{props.label}</span>
            <span className="text-xs">{props.count}</span>
        </Button>
    )
})

function SessionListEmptyState(props: { label: string }): React.JSX.Element {
    return (
        <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--app-divider)] px-4 py-6 text-sm text-[var(--app-hint)]">
            {props.label}
        </div>
    )
}
