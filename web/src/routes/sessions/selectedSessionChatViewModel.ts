import { SessionChat } from '@/components/SessionChat'

type SessionChatProps = React.ComponentProps<typeof SessionChat>

export type RetainedSessionChatSnapshot = {
    routeSessionId: string
    sessionChatProps: SessionChatProps
}

export type SelectedSessionChatSurface = 'pending' | 'ready' | 'retained'

export type SelectedSessionChatViewModel = {
    sessionChatProps: SessionChatProps | null
    sessionError: string | null
    surface: SelectedSessionChatSurface
}

export function createSelectedSessionChatViewModel(options: {
    isSessionDetailReady: boolean
    retainedSnapshot: RetainedSessionChatSnapshot | null
    routeSessionId: string
    sessionChatProps: SessionChatProps | null
    sessionError: string | null
}): SelectedSessionChatViewModel {
    if (options.sessionChatProps && options.isSessionDetailReady) {
        return {
            sessionChatProps: options.sessionChatProps,
            sessionError: options.sessionError,
            surface: 'ready',
        }
    }

    if (options.retainedSnapshot && options.retainedSnapshot.routeSessionId !== options.routeSessionId) {
        return {
            sessionChatProps: options.retainedSnapshot.sessionChatProps,
            sessionError: options.sessionError,
            surface: 'retained',
        }
    }

    return {
        sessionChatProps: options.sessionChatProps,
        sessionError: options.sessionError,
        surface: 'pending',
    }
}

export function shouldPersistRetainedSessionChatSnapshot(surface: SelectedSessionChatSurface): boolean {
    return surface === 'ready'
}
