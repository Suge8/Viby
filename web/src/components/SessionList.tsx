import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { MotionStaggerGroup, MotionStaggerItem } from '@/components/motion/motionPrimitives'
import { SessionListActionController } from '@/components/session-list/SessionListActionController'
import { SessionListControls } from '@/components/session-list/SessionListControls'
import { SessionListView } from '@/components/session-list/SessionListViews'
import type { SessionListRenderContext, SessionListSelection } from '@/components/session-list/sessionListContracts'
import {
    buildSessionSections,
    getSessionListSectionId,
    type SessionListSectionId,
} from '@/components/session-list/sessionListUtils'
import {
    buildSessionListControlTabs,
    createClosedActionTarget,
    findSessionTargets,
    type SessionActionTarget,
} from '@/components/session-list/sessionListViewModel'
import { useSessionListActiveSection } from '@/components/session-list/useSessionListActiveSection'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { useSessionAttention } from '@/hooks/useSessionAttention'
import { useTranslation } from '@/lib/use-translation'
import type { SessionSummary } from '@/types/api'

const SESSION_LIST_ROOT_CLASS_NAME = 'mx-auto flex w-full max-w-content flex-col'
const SESSION_LIST_STICKY_CONTROLS_CLASS_NAME = '-mt-2 sticky top-0 z-10 px-3 pb-2'

type SessionListActions = {
    onSessionIntent?: (sessionId: string, source: 'focus' | 'hover' | 'press') => void
    onSelect: (sessionId: string) => void
    onNewSession: () => void
}

type SessionListProps = {
    sessions: readonly SessionSummary[]
    api: ApiClient | null
    actions: SessionListActions
    selectedSessionId?: string | null
    preferredSectionId?: SessionListSectionId | null
    activeSectionId?: SessionListSectionId | null
    onActiveSectionChange?: (sectionId: SessionListSectionId) => void
}

function SessionListComponent(props: SessionListProps): React.JSX.Element {
    const { t } = useTranslation()
    const {
        activeSectionId: controlledActiveSectionId = null,
        api,
        actions,
        onActiveSectionChange,
        preferredSectionId = null,
        selectedSessionId = null,
        sessions,
    } = props
    const [actionTarget, setActionTarget] = useState<SessionActionTarget>(createClosedActionTarget)
    const { selectedSession, actionSession } = useMemo(() => {
        return findSessionTargets(sessions, selectedSessionId, actionTarget.sessionId)
    }, [actionTarget.sessionId, selectedSessionId, sessions])
    const sections = useMemo(() => buildSessionSections(sessions), [sessions])
    const selectedSectionId = useMemo(() => getSessionListSectionId(selectedSession), [selectedSession])
    const { activeSectionId, setActiveSectionId } = useSessionListActiveSection({
        activeSectionId: controlledActiveSectionId,
        onActiveSectionChange,
        preferredSectionId,
        sections,
        selectedSessionId,
        selectedSectionId,
    })
    const controlTabs = useMemo(() => buildSessionListControlTabs(sections), [sections])
    const controlsModel = useMemo(
        () => ({
            activeTab: activeSectionId,
            ariaLabel: `${t('sessions.section.running')} / ${t('sessions.section.history')}`,
            createLabel: t('sessions.new'),
            tabs: controlTabs.map((section) => ({
                id: section.id,
                label: t(section.titleKey),
                count: section.count,
            })),
        }),
        [activeSectionId, controlTabs, t]
    )
    const controlsActions = useMemo(
        () => ({
            onChange: setActiveSectionId,
            onCreate: actions.onNewSession,
        }),
        [actions.onNewSession, setActiveSectionId]
    )
    const activeSection = useMemo(
        () => sections.find((section) => section.id === activeSectionId) ?? null,
        [activeSectionId, sections]
    )
    const { hasUnseenReply } = useSessionAttention(sessions, selectedSessionId)
    const selection = useMemo<SessionListSelection>(
        () => ({
            onIntent: actions.onSessionIntent,
            onSelect: actions.onSelect,
            selectedSessionId,
        }),
        [actions.onSessionIntent, actions.onSelect, selectedSessionId]
    )

    useEffect(() => {
        if (!actionTarget.sessionId || actionSession) {
            return
        }

        setActionTarget(createClosedActionTarget())
    }, [actionSession, actionTarget.sessionId])

    const handleOpenActionMenu = useCallback((sessionId: string, anchorPoint: FloatingActionMenuAnchorPoint) => {
        setActionTarget({
            sessionId,
            anchorPoint,
        })
    }, [])

    const handleDismissActionController = useCallback(() => {
        setActionTarget(createClosedActionTarget())
    }, [])
    const renderContext = useMemo<SessionListRenderContext>(
        () => ({
            selection,
            hasUnseenReply,
            onOpenActionMenu: handleOpenActionMenu,
        }),
        [handleOpenActionMenu, hasUnseenReply, selection]
    )

    return (
        <div className={SESSION_LIST_ROOT_CLASS_NAME}>
            <MotionStaggerGroup stagger={0.05}>
                <MotionStaggerItem className={SESSION_LIST_STICKY_CONTROLS_CLASS_NAME} y={-12} scaleFrom={0.992}>
                    <SessionListControls model={controlsModel} actions={controlsActions} />
                </MotionStaggerItem>

                <MotionStaggerItem y={10} scaleFrom={0.996}>
                    <SessionListView
                        activeSection={activeSection}
                        renderContext={renderContext}
                        emptyLabel={t('sessions.empty.sessions')}
                        t={t}
                    />
                </MotionStaggerItem>
            </MotionStaggerGroup>

            {actionSession ? (
                <SessionListActionController
                    api={api}
                    session={actionSession}
                    anchorPoint={actionTarget.anchorPoint}
                    callbacks={{
                        onDismiss: handleDismissActionController,
                    }}
                />
            ) : null}
        </div>
    )
}

export const SessionList = memo(SessionListComponent)
SessionList.displayName = 'SessionList'
