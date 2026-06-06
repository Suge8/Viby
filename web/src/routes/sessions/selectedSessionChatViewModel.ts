import { SessionChat } from '@/components/SessionChat'

type SessionChatProps = React.ComponentProps<typeof SessionChat>

export type RetainedSessionChatSnapshot = {
    routeSessionId: string
    sessionChatProps: SessionChatProps
}

export type SelectedSessionWorkspacePhase = 'pending' | 'ready' | 'retained'
export type SelectedSessionChatSurface = SelectedSessionWorkspacePhase

export type SelectedSessionWorkspaceState = {
    phase: SelectedSessionWorkspacePhase
    sessionChatProps: SessionChatProps | null
    sessionError: string | null
}

export type SelectedSessionChatViewModel = SelectedSessionWorkspaceState & {
    surface: SelectedSessionWorkspacePhase
}

export function createSelectedSessionWorkspaceState(options: {
    isSessionDetailReady: boolean
    retainedSnapshot: RetainedSessionChatSnapshot | null
    routeSessionId: string
    sessionChatProps: SessionChatProps | null
    sessionError: string | null
}): SelectedSessionWorkspaceState {
    if (options.sessionChatProps && options.isSessionDetailReady) {
        return {
            phase: 'ready',
            sessionChatProps: options.sessionChatProps,
            sessionError: options.sessionError,
        }
    }

    if (options.retainedSnapshot && options.retainedSnapshot.routeSessionId !== options.routeSessionId) {
        return {
            phase: 'retained',
            sessionChatProps: options.retainedSnapshot.sessionChatProps,
            sessionError: options.sessionError,
        }
    }

    return {
        phase: 'pending',
        sessionChatProps: options.sessionChatProps,
        sessionError: options.sessionError,
    }
}

export function createSelectedSessionChatViewModel(
    options: Parameters<typeof createSelectedSessionWorkspaceState>[0]
): SelectedSessionChatViewModel {
    const state = createSelectedSessionWorkspaceState(options)
    return { ...state, surface: state.phase }
}

export function shouldPersistRetainedSessionChatSnapshot(surface: SelectedSessionChatSurface): boolean {
    return surface === 'ready'
}
