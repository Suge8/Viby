import { debugWebRuntime } from '@/lib/runtimeDiagnostics'

type DraftTraceEvent = {
    type:
        | 'read-hit'
        | 'read-miss'
        | 'restore'
        | 'restore-skipped'
        | 'write'
        | 'write-confirmed'
        | 'write-failed'
        | 'remove'
        | 'flush-skip-empty'
        | 'preserve-empty'
    sessionId: string
    valueLength: number
    reason: string
}

type DraftTraceWindow = Window & {
    __VIBY_DRAFT_TRACE__?: Array<DraftTraceEvent & { at: number }>
    __VIBY_ENABLE_DRAFT_TRACE_LOG__?: boolean
}

export function emitDraftTrace(event: DraftTraceEvent): void {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return
    }

    const payload = {
        at: Date.now(),
        ...event,
    }
    const traceWindow = window as DraftTraceWindow
    traceWindow.__VIBY_DRAFT_TRACE__ = [...(traceWindow.__VIBY_DRAFT_TRACE__ ?? []), payload].slice(-200)
    if (traceWindow.__VIBY_ENABLE_DRAFT_TRACE_LOG__ === true) {
        debugWebRuntime('draft trace', payload)
    }
}
