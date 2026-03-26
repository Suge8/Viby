import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { SessionChat } from '@/components/SessionChat'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import { shouldShowSessionChatPendingShell } from '@/components/sessionChatLoadingContract'
import { useSession } from '@/hooks/queries/useSession'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { useTranslation } from '@/lib/use-translation'
import { useSessionChatRouteModel } from '@/routes/sessions/useSessionChatRouteModel'

type RetainedSessionChatSnapshot = {
    routeSessionId: string
    sessionChatProps: React.ComponentProps<typeof SessionChat>
}

function isSessionChatSurfaceReady(
    sessionChatProps: React.ComponentProps<typeof SessionChat>
): boolean {
    return !shouldShowSessionChatPendingShell({
        messagesCount: sessionChatProps.messages.length,
        isDetailPending: sessionChatProps.isDetailPending,
        hasLoadedLatestMessages: sessionChatProps.hasLoadedLatestMessages,
        hasWarmSessionSnapshot: sessionChatProps.hasWarmSessionSnapshot
    })
}

export default function SessionChatRoute(): React.JSX.Element {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessionId: routeSessionId } = useParams({ from: '/sessions/$sessionId' })
    const retainedSnapshotRef = useRef<RetainedSessionChatSnapshot | null>(null)

    useEffect(() => {
        appendRealtimeTrace({
            at: Date.now(),
            type: 'chat_opened',
            details: { sessionId: routeSessionId }
        })
    }, [routeSessionId])
    const {
        session,
        error: sessionError,
        refetch: refetchSession,
        isPlaceholderData,
        hasWarmSnapshot
    } = useSession(api, routeSessionId)

    const navigate = useNavigate()

    useEffect(() => {
        if (!sessionError) {
            return
        }

        addToast({
            title: errorPreset.title,
            description: sessionError,
            tone: 'danger',
            href: '/sessions'
        })

        void navigate({
            to: '/sessions',
            replace: true
        })
    }, [addToast, errorPreset.title, navigate, sessionError])

    if (sessionError) {
        return <RouteLoadingFallback kind="session" testId="session-route-pending" />
    }

    if (!session) {
        const retainedSnapshot = retainedSnapshotRef.current
        if (retainedSnapshot && retainedSnapshot.routeSessionId !== routeSessionId) {
            return <RetainedSessionChatSurface snapshot={retainedSnapshot} />
        }

        return <RouteLoadingFallback kind="session" testId="session-route-pending" />
    }

    return (
        <ResolvedSessionChatRoute
            api={api}
            hasWarmSessionSnapshot={hasWarmSnapshot}
            isDetailPending={isPlaceholderData}
            refetchSession={refetchSession}
            session={session}
            sessionId={routeSessionId}
            onRetainedSnapshotReady={(snapshot) => {
                retainedSnapshotRef.current = snapshot
            }}
            retainedSnapshot={retainedSnapshotRef.current}
        />
    )
}

type ResolvedSessionChatRouteProps = {
    api: ReturnType<typeof useAppContext>['api']
    hasWarmSessionSnapshot: boolean
    isDetailPending: boolean
    onRetainedSnapshotReady: (snapshot: RetainedSessionChatSnapshot) => void
    refetchSession: ReturnType<typeof useSession>['refetch']
    retainedSnapshot: RetainedSessionChatSnapshot | null
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

function ResolvedSessionChatRoute(props: ResolvedSessionChatRouteProps): React.JSX.Element {
    const sessionChatProps = useSessionChatRouteModel(props)
    const surfaceReady = isSessionChatSurfaceReady(sessionChatProps)

    useFinalizeBootShell(surfaceReady)

    useEffect(() => {
        if (!surfaceReady) {
            return
        }

        props.onRetainedSnapshotReady({
            routeSessionId: props.sessionId,
            sessionChatProps
        })
    }, [props.onRetainedSnapshotReady, props.sessionId, sessionChatProps, surfaceReady])

    if (!surfaceReady && props.retainedSnapshot && props.retainedSnapshot.routeSessionId !== props.sessionId) {
        return <RetainedSessionChatSurface snapshot={props.retainedSnapshot} />
    }

    return <SessionChat {...sessionChatProps} />
}

function RetainedSessionChatSurface(props: {
    snapshot: RetainedSessionChatSnapshot
}): React.JSX.Element {
    useFinalizeBootShell()

    return (
        <div
            data-testid="retained-session-chat"
            className="h-full min-h-0 w-full pointer-events-none"
            aria-hidden="true"
        >
            <SessionChat {...props.snapshot.sessionChatProps} />
        </div>
    )
}
