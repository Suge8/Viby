import { Suspense, lazy } from 'react'
import type { ApiClient } from '@/api/client'
import type { Session } from '@/types/api'

const LazyProjectPanel = lazy(async () => {
    const module = await import('@/components/ProjectPanel')
    return { default: module.ProjectPanel }
})

const LazyMemberControlBanner = lazy(async () => {
    const module = await import('@/components/MemberControlBanner')
    return { default: module.MemberControlBanner }
})

type SessionChatTeamSurfaceProps = {
    api: ApiClient
    session: Session
}

export function SessionChatTeamSurface(props: SessionChatTeamSurfaceProps): React.JSX.Element | null {
    const sessionRole = props.session.teamContext?.sessionRole
    if (sessionRole === 'manager') {
        return (
            <Suspense fallback={null}>
                <LazyProjectPanel api={props.api} session={props.session} />
            </Suspense>
        )
    }

    if (sessionRole === 'member') {
        return (
            <Suspense fallback={null}>
                <LazyMemberControlBanner api={props.api} session={props.session} />
            </Suspense>
        )
    }

    return null
}
