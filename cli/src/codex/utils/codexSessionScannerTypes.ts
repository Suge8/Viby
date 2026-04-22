import type { CodexSessionEvent } from './codexEventConverter'

export interface CodexSessionScannerOptions {
    sessionId: string | null
    onEvent: (event: CodexSessionEvent) => void
    onDiscoveredSessionId?: (sessionId: string) => void
    onSessionMatchFailed?: (message: string) => void
    cwd?: string
    startupTimestampMs?: number
    sessionStartWindowMs?: number
}

export interface CodexSessionScanner {
    cleanup: () => Promise<void>
    onNewSession: (sessionId: string) => void
}

export const DEFAULT_SESSION_START_WINDOW_MS = 2 * 60 * 1000
export const ACTIVE_SESSION_FALLBACK_SCAN_INTERVAL_MS = 15_000
export const SESSION_DISCOVERY_SCAN_INTERVAL_MS = 2_000
