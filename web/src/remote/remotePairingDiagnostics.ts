import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { SESSION_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

type RemotePairingDiagnosticEvent = Readonly<{
    at: number
    source: string
    detail: Record<string, string | number | boolean | null>
}>

const MAX_EVENTS = 200
const STORAGE_KEY = SESSION_STORAGE_KEYS.remotePairingDiagnostics
const events: RemotePairingDiagnosticEvent[] = []

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDetailValue(value: unknown): value is string | number | boolean | null {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function isDiagnosticEvent(value: unknown): value is RemotePairingDiagnosticEvent {
    if (!isRecord(value) || typeof value.at !== 'number' || typeof value.source !== 'string') return false
    if (!isRecord(value.detail)) return false
    return Object.values(value.detail).every(isDetailValue)
}

function readStoredDiagnostics(payload: string): RemotePairingDiagnosticEvent[] | null {
    const parsed = JSON.parse(payload) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.every(isDiagnosticEvent) ? parsed : null
}

export function isRemotePairingDiagnosticsEnabled(): boolean {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('debug') === 'pairing'
}

function isEnabled(): boolean {
    return isRemotePairingDiagnosticsEnabled()
}

export function recordRemotePairingDiagnostic(
    source: string,
    detail: Record<string, string | number | boolean | null>
): void {
    if (!isEnabled()) return
    events.push({ at: Date.now(), source, detail })
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
    writeBrowserStorageItem('session', STORAGE_KEY, JSON.stringify(events))
}

export function recordRemotePairingRouteDiagnostic(input: {
    event: string
    phase: string
    reason?: string | null
    route: string | null
}): void {
    recordRemotePairingDiagnostic('route', {
        event: input.event,
        phase: input.phase,
        reason: input.reason ?? 'none',
        route: input.route ?? 'none',
    })
}

export function recordRemoteRelayHeartbeatTimeoutDiagnostic(route: string | null, nextRoute: string | null): void {
    recordRemotePairingDiagnostic('relay-heartbeat-timeout', {
        route: route ?? 'none',
        nextRoute: nextRoute ?? 'none',
        reason: 'ack-deadline',
    })
}

export function readRemotePairingDiagnostics(): readonly RemotePairingDiagnosticEvent[] {
    if (events.length > 0 || typeof window === 'undefined') return events
    const stored = readBrowserStorageItem('session', STORAGE_KEY)
    if (!stored) return events
    try {
        const parsed = readStoredDiagnostics(stored)
        if (!parsed) throw new Error('invalid remote pairing diagnostics')
        events.push(...parsed.slice(-MAX_EVENTS))
    } catch {
        removeBrowserStorageItem('session', STORAGE_KEY)
    }
    return events
}

export function formatRemotePairingDiagnostics(): string {
    return JSON.stringify(readRemotePairingDiagnostics(), null, 2)
}

export function resetRemotePairingDiagnosticsForTests(): void {
    events.length = 0
}
