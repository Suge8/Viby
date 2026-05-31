import { PairingByeReasonSchema } from './pairingSignal'

/**
 * Broker WebSocket close-code semantics — the single source of truth shared by
 * every pairing endpoint (desktop relay bridge, web relay socket, direct `/ws`
 * transport).
 *
 * The broker closes a socket with a specific code+reason when a credential is
 * *permanently* rejected: a stale/invalid host token (`1008 invalid_token`), or
 * a deleted/expired pairing (`1000 pairing_unavailable`, plus the other
 * `bye` reasons). An endpoint that keeps reconnecting on these codes
 * reconnect-storms forever and starves a freshly scanned pairing on the same
 * broker origin — the "把电脑牵回来" hang. These closes MUST be terminal.
 *
 * A close with no fatal reason (network blip, our own `close()`, a graceful
 * `1000` with an empty reason) is transient and should be retried with backoff.
 */
export const PAIRING_WS_CLOSE_INVALID_TOKEN = 1008
export const PAIRING_WS_CLOSE_REPLACED = 1012

export interface PairingSocketCloseInfo {
    code: number
    reason: string
}

const FATAL_BYE_REASONS: ReadonlySet<string> = new Set<string>(PairingByeReasonSchema.options)

/**
 * Returns the fatal reason when the close means the credential is permanently
 * rejected (no reconnect should be attempted), or `null` when the close is
 * transient and the endpoint should reconnect with backoff.
 */
export function classifyFatalPairingClose(info: PairingSocketCloseInfo | undefined): string | null {
    if (!info) return null
    if (info.code === PAIRING_WS_CLOSE_INVALID_TOKEN) return info.reason || 'invalid_token'
    if (info.code === PAIRING_WS_CLOSE_REPLACED && info.reason === 'replaced') return 'replaced'
    if (FATAL_BYE_REASONS.has(info.reason)) return info.reason
    return null
}
