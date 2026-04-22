import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { RouteLoadingFallback } from '@/components/loading/RouteLoadingFallback'
import { SessionChatPendingState } from '@/components/loading/SessionChatPendingState'
import { SessionChat } from '@/components/SessionChat'
import { useSession } from '@/hooks/queries/useSession'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import { useNoticeCenter } from '@/lib/notice-center'
import { getNoticePreset } from '@/lib/noticePresets'
import { appendRealtimeTrace } from '@/lib/realtimeTrace'
import { useTranslation } from '@/lib/use-translation'
import {
    createSelectedSessionChatViewModel,
    type RetainedSessionChatSnapshot,
    shouldPersistRetainedSessionChatSnapshot,
} from '@/routes/sessions/selectedSessionChatViewModel'
import { useSessionChatRouteModel } from '@/routes/sessions/useSessionChatRouteModel'

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
            details: { sessionId: routeSessionId },
        })
    }, [routeSessionId])
    const { session, error: sessionError } = useSession(api, routeSessionId)

    const navigate = useNavigate()

    useEffect(() => {
        if (!sessionError) {
            return
        }

        addToast({
            title: errorPreset.title,
            description: sessionError,
            tone: 'danger',
            href: '/sessions',
        })

        void navigate({
            to: '/sessions',
            replace: true,
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
    onRetainedSnapshotReady: (snapshot: RetainedSessionChatSnapshot) => void
    retainedSnapshot: RetainedSessionChatSnapshot | null
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

function ResolvedSessionChatRoute(props: ResolvedSessionChatRouteProps): React.JSX.Element {
    const { isSessionDetailReady, sessionChatProps } = useSessionChatRouteModel(props)
    const viewModel = createSelectedSessionChatViewModel({
        isSessionDetailReady,
        retainedSnapshot: props.retainedSnapshot,
        routeSessionId: props.sessionId,
        sessionChatProps,
        sessionError: null,
    })

    useFinalizeBootShell(viewModel.surface === 'ready')

    useEffect(() => {
        if (!shouldPersistRetainedSessionChatSnapshot(viewModel.surface)) {
            return
        }

        props.onRetainedSnapshotReady({
            routeSessionId: props.sessionId,
            sessionChatProps,
        })
    }, [props.onRetainedSnapshotReady, props.sessionId, sessionChatProps, viewModel.surface])

    if (viewModel.surface === 'retained') {
        if (!viewModel.sessionChatProps) {
            return <SessionChatPendingState testId="session-chat-detail-pending" />
        }
        return (
            <RetainedSessionChatSurface
                snapshot={{ routeSessionId: props.sessionId, sessionChatProps: viewModel.sessionChatProps }}
            />
        )
    }

    if (viewModel.surface === 'pending') {
        return <SessionChatPendingState testId="session-chat-detail-pending" />
    }

    return <SessionChat {...sessionChatProps} />
}

function RetainedSessionChatSurface(props: { snapshot: RetainedSessionChatSnapshot }): React.JSX.Element {
    useFinalizeBootShell()

    return (
        <div
            data-testid="retained-session-chat"
            className="h-full min-h-0 w-full pointer-events-none"
            aria-hidden="true"
        >
            <SessionChat
                {...props.snapshot.sessionChatProps}
                workspace={{
                    ...props.snapshot.sessionChatProps.workspace,
                    persistComposerDraft: false,
                }}
            />
        </div>
    )
}
