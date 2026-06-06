import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useSyncExternalStore } from 'react'
import type { ApiClient } from '@/api/client'
import { type RealtimeBannerState, useRealtimeFeedback } from '@/hooks/useRealtimeFeedback'
import { runRealtimeRecovery } from '@/lib/realtimeRecovery'
import { RealtimeRecoveryRuntime, type RealtimeRecoveryTrigger } from '@/lib/realtimeRecoveryRuntime'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'

function getRecoveryErrorMessage(trigger: RealtimeRecoveryTrigger): string {
    if (trigger === 'socket-reconnect') return 'Failed to refresh queries after realtime reconnect.'
    if (trigger === 'page-restored') return 'Failed to refresh queries after page restore.'
    if (trigger === 'user-retry') return 'Failed to refresh queries after user retry.'
    return 'Failed to refresh queries after foreground recovery.'
}

export function useRealtimeRecoveryRuntime(
    api: ApiClient,
    selectedSessionId: string | null
): ReturnType<typeof useRealtimeFeedback> & { runtime: RealtimeRecoveryRuntime } {
    const queryClient = useQueryClient()
    const recoveryContextRef = useRef({ api, queryClient, selectedSessionId })
    recoveryContextRef.current = { api, queryClient, selectedSessionId }
    const runtime = useMemo(
        () =>
            new RealtimeRecoveryRuntime({
                runRecovery: async () => runRealtimeRecovery(recoveryContextRef.current),
                reportRecoveryError: (trigger, error) => {
                    reportWebRuntimeError(getRecoveryErrorMessage(trigger), error)
                },
            }),
        []
    )
    const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
    const feedback = useRealtimeFeedback(state, () => runtime.retry())
    return { ...feedback, runtime }
}

export type { RealtimeBannerState }
