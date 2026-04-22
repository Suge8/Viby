export type RealtimeTraceEventType =
    | 'connect'
    | 'disconnect'
    | 'connect_error'
    | 'sync_start'
    | 'sync_end'
    | 'restore'
    | 'update_available'
    | 'update_apply'
    | 'update_apply_error'
    | 'spawn_success'
    | 'chat_opened'
    | 'message_send_start'
    | 'server_accepted'
    | 'thinking_visible'
    | 'first_stream_delta'
    | 'first_reply_detected'
    | 'post_switch_send_failed'
    | 'post_switch_catchup_error'

export type RealtimeTraceEntry = {
    at: number
    type: RealtimeTraceEventType
    details?: Record<string, unknown>
}

const MAX_TRACE_ENTRIES = 50

declare global {
    interface Window {
        __vibyRealtimeTrace?: RealtimeTraceEntry[]
    }
}

function getTraceHost(): Window | null {
    if (typeof window === 'undefined') {
        return null
    }
    return window
}

export function appendRealtimeTrace(entry: RealtimeTraceEntry): RealtimeTraceEntry[] {
    const host = getTraceHost()
    if (!host) {
        return [entry]
    }

    const current = host.__vibyRealtimeTrace ?? []
    const next = [...current.slice(-(MAX_TRACE_ENTRIES - 1)), entry]
    host.__vibyRealtimeTrace = next
    return next
}
