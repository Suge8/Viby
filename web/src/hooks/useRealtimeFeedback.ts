import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppRecoveryReason } from '@/lib/appRecovery'
import { appendRealtimeTrace, type RealtimeTraceEventType } from '@/lib/realtimeTrace'

const BUSY_BANNER_DEBOUNCE_MS = 450
const BUSY_BANNER_MAX_DURATION_MS = 10_000
const RESTORE_BANNER_DURATION_MS = 2_400

export type RealtimeBannerState =
    | { kind: 'hidden' }
    | { kind: 'busy' }
    | { kind: 'restoring'; reason: AppRecoveryReason }

type RealtimeConnectDetails = {
    initial: boolean
    recovered: boolean
    transport?: string | null
}

type RealtimeFeedbackState = {
    banner: RealtimeBannerState
    handleConnect: (details: RealtimeConnectDetails) => void
    handleDisconnect: (reason: string) => void
    handleConnectError: (error: unknown) => void
    announceRecovery: (reason: AppRecoveryReason) => void
    runCatchupSync: (task: Promise<unknown>) => void
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown'
}

export function useRealtimeFeedback(): RealtimeFeedbackState {
    const [banner, setBanner] = useState<RealtimeBannerState>({ kind: 'hidden' })
    const hasConnectedRef = useRef(false)
    const busyDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const busyMaxTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const pushTrace = useCallback((type: RealtimeTraceEventType, details?: Record<string, unknown>) => {
        appendRealtimeTrace({
            at: Date.now(),
            type,
            details
        })
    }, [])

    const clearBusyTimers = useCallback(() => {
        if (busyDelayTimeoutRef.current) {
            clearTimeout(busyDelayTimeoutRef.current)
            busyDelayTimeoutRef.current = null
        }
        if (busyMaxTimeoutRef.current) {
            clearTimeout(busyMaxTimeoutRef.current)
            busyMaxTimeoutRef.current = null
        }
    }, [])

    const clearRestoreTimer = useCallback(() => {
        if (!restoreTimeoutRef.current) {
            return
        }

        clearTimeout(restoreTimeoutRef.current)
        restoreTimeoutRef.current = null
    }, [])

    const resolveBannerAfterRestore = useCallback(() => {
        setBanner((current) => {
            if (current.kind !== 'restoring') {
                return current
            }

            if (busyDelayTimeoutRef.current || busyMaxTimeoutRef.current) {
                return { kind: 'busy' }
            }

            return { kind: 'hidden' }
        })
        restoreTimeoutRef.current = null
    }, [])

    const scheduleBusyBanner = useCallback(() => {
        if (busyDelayTimeoutRef.current || busyMaxTimeoutRef.current) {
            return
        }

        busyDelayTimeoutRef.current = setTimeout(() => {
            busyDelayTimeoutRef.current = null
            setBanner((current) => {
                if (current.kind === 'restoring') {
                    return current
                }

                return { kind: 'busy' }
            })
            busyMaxTimeoutRef.current = setTimeout(() => {
                busyMaxTimeoutRef.current = null
                setBanner((current) => current.kind === 'busy' ? { kind: 'hidden' } : current)
            }, BUSY_BANNER_MAX_DURATION_MS)
        }, BUSY_BANNER_DEBOUNCE_MS)
    }, [])

    const handleConnect = useCallback((details: RealtimeConnectDetails) => {
        hasConnectedRef.current = true

        if (details.initial || details.recovered) {
            clearBusyTimers()
            setBanner((current) => current.kind === 'restoring' ? current : { kind: 'hidden' })
        }
        pushTrace('connect', details)
    }, [clearBusyTimers, pushTrace])

    const handleDisconnect = useCallback((reason: string) => {
        if (!hasConnectedRef.current) {
            return
        }
        scheduleBusyBanner()
        pushTrace('disconnect', { reason })
    }, [pushTrace, scheduleBusyBanner])

    const handleConnectError = useCallback((error: unknown) => {
        scheduleBusyBanner()
        pushTrace('connect_error', { message: getErrorMessage(error) })
    }, [pushTrace, scheduleBusyBanner])

    const announceRecovery = useCallback((reason: AppRecoveryReason) => {
        clearBusyTimers()
        clearRestoreTimer()
        setBanner({ kind: 'restoring', reason })
        pushTrace('restore', { reason })
        restoreTimeoutRef.current = setTimeout(() => {
            resolveBannerAfterRestore()
        }, RESTORE_BANNER_DURATION_MS)
    }, [clearBusyTimers, clearRestoreTimer, pushTrace, resolveBannerAfterRestore])

    const runCatchupSync = useCallback((task: Promise<unknown>) => {
        scheduleBusyBanner()
        pushTrace('sync_start')

        void task.finally(() => {
            clearBusyTimers()
            setBanner((current) => current.kind === 'restoring' ? current : { kind: 'hidden' })
            pushTrace('sync_end')
        })
    }, [clearBusyTimers, pushTrace, scheduleBusyBanner])

    useEffect(() => {
        return () => {
            clearBusyTimers()
            clearRestoreTimer()
        }
    }, [clearBusyTimers, clearRestoreTimer])

    return {
        banner,
        handleConnect,
        handleDisconnect,
        handleConnectError,
        announceRecovery,
        runCatchupSync
    }
}
