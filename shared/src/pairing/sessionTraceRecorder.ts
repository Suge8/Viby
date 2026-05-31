import {
    SESSION_TRACE_SCHEMA_VERSION,
    type SessionTraceBundle,
    type SessionTraceEventName,
    type SessionTraceEventRecord,
    type SessionTracePeerRole,
    type SessionTracePrimitive,
    type SessionTraceRouteTransition,
} from './sessionTrace'

const DEFAULT_TRACE_LIMIT = 256
const MAX_STRING_LENGTH = 64
const SECRET_KEY_PATTERN = /(token|ticket|secret|credential|proof|sdp|publickey|privatekey|authorization)/i
const SECRET_VALUE_PATTERN = /(bearer\s+|-----BEGIN|candidate:|a=ice-|a=fingerprint:)/i

export interface SessionTraceRecorder {
    emit(input: {
        event: SessionTraceEventName
        payloadMeta?: Record<string, unknown>
        routeTransition?: SessionTraceRouteTransition
        sessionId?: string | null
    }): SessionTraceEventRecord
    export(): SessionTraceBundle
    subscribe(listener: (event: SessionTraceEventRecord) => void): () => void
}

export function createSessionTraceRecorder(options: {
    limit?: number
    monotonicNow?: () => number
    pairingId: string
    peerRole: SessionTracePeerRole
    wallNow?: () => number
}): SessionTraceRecorder {
    const limit = options.limit ?? DEFAULT_TRACE_LIMIT
    const monotonicNow = options.monotonicNow ?? defaultMonotonicNow
    const wallNow = options.wallNow ?? Date.now
    const events: SessionTraceEventRecord[] = []
    const listeners = new Set<(event: SessionTraceEventRecord) => void>()
    let seq = 0

    return {
        emit(input) {
            const event: SessionTraceEventRecord = {
                pairingId: options.pairingId,
                sessionId: input.sessionId ?? null,
                peerRole: options.peerRole,
                seq: seq++,
                monotonicMs: monotonicNow(),
                wallMs: wallNow(),
                event: input.event,
                routeTransition: input.routeTransition,
                payloadMeta: redactPayloadMeta(input.payloadMeta ?? {}),
            }
            events.push(event)
            if (events.length > limit) events.splice(0, events.length - limit)
            for (const listener of listeners) listener(event)
            return event
        },
        export() {
            return {
                schemaVersion: SESSION_TRACE_SCHEMA_VERSION,
                pairingId: options.pairingId,
                capturedAt: wallNow(),
                events: [...events],
            }
        },
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    }
}

export function redactPayloadMeta(input: Record<string, unknown>): Record<string, SessionTracePrimitive> {
    const output: Record<string, SessionTracePrimitive> = {}
    for (const [key, value] of Object.entries(input)) {
        if (!isTracePrimitive(value)) continue
        output[key] = redactPrimitive(key, value)
    }
    return output
}

function redactPrimitive(key: string, value: SessionTracePrimitive): SessionTracePrimitive {
    if (value === null || typeof value !== 'string') return value
    if (SECRET_KEY_PATTERN.test(key) || SECRET_VALUE_PATTERN.test(value)) return '[redacted]'
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value
}

function isTracePrimitive(value: unknown): value is SessionTracePrimitive {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function defaultMonotonicNow(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now()
}
