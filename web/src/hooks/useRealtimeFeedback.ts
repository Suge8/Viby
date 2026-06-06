import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppRecoveryReason } from '@/lib/appRecovery'
import type { RealtimeRecoveryRuntimeState } from '@/lib/realtimeRecoveryRuntime'

const RESTORE_BANNER_DURATION_MS = 1_600

export type RealtimeBannerState =
    | { kind: 'hidden' }
    | { kind: 'busy' }
    | { kind: 'restoring'; reason: AppRecoveryReason }
    | { kind: 'failed'; retry: () => void }

type RealtimeFeedbackState = {
    banner: RealtimeBannerState
    announceRecovery: (reason: AppRecoveryReason) => void
}

function toRuntimeBanner(state: RealtimeRecoveryRuntimeState, retry: () => void): RealtimeBannerState {
    if (state.status === 'failed') return { kind: 'failed', retry }
    if (state.status === 'reconnecting' || state.status === 'syncing') return { kind: 'busy' }
    return { kind: 'hidden' }
}

export function useRealtimeFeedback(state: RealtimeRecoveryRuntimeState, retry: () => void): RealtimeFeedbackState {
    const [restoreBanner, setRestoreBanner] = useState<RealtimeBannerState | null>(null)
    const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearRestoreTimer = useCallback(() => {
        if (!restoreTimeoutRef.current) return
        clearTimeout(restoreTimeoutRef.current)
        restoreTimeoutRef.current = null
    }, [])

    const announceRecovery = useCallback(
        (reason: AppRecoveryReason) => {
            clearRestoreTimer()
            setRestoreBanner({ kind: 'restoring', reason })
            restoreTimeoutRef.current = setTimeout(() => {
                restoreTimeoutRef.current = null
                setRestoreBanner(null)
            }, RESTORE_BANNER_DURATION_MS)
        },
        [clearRestoreTimer]
    )

    useEffect(() => {
        if (state.status !== 'failed') return
        clearRestoreTimer()
        setRestoreBanner(null)
    }, [clearRestoreTimer, state.status])

    useEffect(() => {
        return clearRestoreTimer
    }, [clearRestoreTimer])

    const runtimeBanner = useMemo(() => toRuntimeBanner(state, retry), [retry, state])

    return {
        banner: runtimeBanner.kind === 'failed' ? runtimeBanner : (restoreBanner ?? runtimeBanner),
        announceRecovery,
    }
}
