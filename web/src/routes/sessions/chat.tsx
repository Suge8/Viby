import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
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
import { useRemotePairingInteractionBlocked } from '@/remote/remotePairingInteractionState'
import type { RetainedSessionChatSnapshot } from '@/routes/sessions/selectedSessionChatViewModel'
import {
    readSelectedSessionRetainedSnapshot,
    useSelectedSessionWorkspace,
} from '@/routes/sessions/useSelectedSessionWorkspace'

export default function SessionChatRoute(): React.JSX.Element {
    const { api } = useAppContext()
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    const errorPreset = getNoticePreset('genericError', t)
    const { sessionId: routeSessionId } = useParams({ from: '/sessions/$sessionId' })
    const remoteInteractionBlocked = useRemotePairingInteractionBlocked()

    useEffect(() => {
        appendRealtimeTrace({
            at: Date.now(),
            type: 'chat_opened',
            details: { sessionId: routeSessionId },
        })
    }, [routeSessionId])
    const { session, isDetailHydrated, error: sessionError } = useSession(api, routeSessionId)

    const navigate = useNavigate()

    useEffect(() => {
        if (!sessionError || remoteInteractionBlocked) {
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
    }, [addToast, errorPreset.title, navigate, remoteInteractionBlocked, sessionError])

    if (sessionError) {
        return <RouteLoadingFallback kind="workspace" testId="session-route-pending" />
    }

    if (!session) {
        const retainedSnapshot = readSelectedSessionRetainedSnapshot(routeSessionId)
        if (retainedSnapshot) {
            return <RetainedSessionChatSurface snapshot={retainedSnapshot} />
        }

        return <RouteLoadingFallback kind="workspace" testId="session-route-pending" />
    }

    return (
        <ResolvedSessionChatRoute
            api={api}
            isSessionDetailHydrated={isDetailHydrated}
            session={session}
            sessionId={routeSessionId}
        />
    )
}

type ResolvedSessionChatRouteProps = {
    api: ReturnType<typeof useAppContext>['api']
    isSessionDetailHydrated: boolean
    session: NonNullable<ReturnType<typeof useSession>['session']>
    sessionId: string
}

function ResolvedSessionChatRoute(props: ResolvedSessionChatRouteProps): React.JSX.Element {
    const viewModel = useSelectedSessionWorkspace(props)

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

    if (!viewModel.sessionChatProps) {
        return <SessionChatPendingState testId="session-chat-detail-pending" />
    }

    return <SessionChat {...viewModel.sessionChatProps} />
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
