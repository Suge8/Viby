import { useEffect } from 'react'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { setAtBottom as setMessageWindowAtBottom } from '@/lib/messageWindowStoreCore'
import {
    createSelectedSessionChatViewModel,
    type RetainedSessionChatSnapshot,
    type SelectedSessionChatViewModel,
    shouldPersistRetainedSessionChatSnapshot,
} from '@/routes/sessions/selectedSessionChatViewModel'
import { type SessionChatRouteModelOptions, useSessionChatRouteModel } from '@/routes/sessions/useSessionChatRouteModel'

export type SelectedSessionWorkspaceOptions = SessionChatRouteModelOptions & {
    onRetainedSnapshotReady: (snapshot: RetainedSessionChatSnapshot) => void
    retainedSnapshot: RetainedSessionChatSnapshot | null
}

export function useSelectedSessionWorkspace(options: SelectedSessionWorkspaceOptions): SelectedSessionChatViewModel {
    const { isSessionDetailReady, sessionChatProps } = useSessionChatRouteModel(options)
    const viewModel = createSelectedSessionChatViewModel({
        isSessionDetailReady,
        retainedSnapshot: options.retainedSnapshot,
        routeSessionId: options.sessionId,
        sessionChatProps,
        sessionError: null,
    })

    useFinalizeBootShell(viewModel.surface === 'ready')

    useEffect(() => {
        setMessageWindowAtBottom(options.sessionId, true)
    }, [options.sessionId])

    useEffect(() => {
        if (!shouldPersistRetainedSessionChatSnapshot(viewModel.surface)) return

        options.onRetainedSnapshotReady({
            routeSessionId: options.sessionId,
            sessionChatProps,
        })
    }, [options.onRetainedSnapshotReady, options.sessionId, sessionChatProps, viewModel.surface])

    return viewModel
}
