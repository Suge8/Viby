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

export type SelectedSessionWorkspaceOptions = SessionChatRouteModelOptions

let retainedSnapshot: RetainedSessionChatSnapshot | null = null

export function readSelectedSessionRetainedSnapshot(routeSessionId: string): RetainedSessionChatSnapshot | null {
    return retainedSnapshot && retainedSnapshot.routeSessionId !== routeSessionId ? retainedSnapshot : null
}

function persistRetainedSnapshot(snapshot: RetainedSessionChatSnapshot): void {
    retainedSnapshot = snapshot
}

export function clearSelectedSessionRetainedSnapshotForTest(): void {
    retainedSnapshot = null
}

function useSelectedSessionWorkspaceBootEffect(ready: boolean): void {
    useFinalizeBootShell(ready)
}

function useSelectedSessionWorkspaceEntryEffect(sessionId: string): void {
    useEffect(() => {
        setMessageWindowAtBottom(sessionId, true)
    }, [sessionId])
}

export function useSelectedSessionWorkspace(options: SelectedSessionWorkspaceOptions): SelectedSessionChatViewModel {
    const { isSessionDetailReady, sessionChatProps } = useSessionChatRouteModel(options)
    const viewModel = createSelectedSessionChatViewModel({
        isSessionDetailReady,
        retainedSnapshot,
        routeSessionId: options.sessionId,
        sessionChatProps,
        sessionError: null,
    })

    useSelectedSessionWorkspaceBootEffect(viewModel.phase === 'ready')
    useSelectedSessionWorkspaceEntryEffect(options.sessionId)

    useEffect(() => {
        if (!shouldPersistRetainedSessionChatSnapshot(viewModel.phase)) return
        persistRetainedSnapshot({
            routeSessionId: options.sessionId,
            sessionChatProps,
        })
    }, [options.sessionId, sessionChatProps, viewModel.phase])

    return viewModel
}
