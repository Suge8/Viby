import { PAIRING_REMOTE_RECONNECT_BASE_DELAY_MS, PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS } from '@viby/protocol'
import { isBrowserStorageUnavailableError } from '@/lib/browserStorage'
import { isAppCacheUnavailableError } from '@/lib/storage/appCacheDb'
import { RemotePeerConnectError } from './remotePairingErrors'
import { RemotePairingHttpError } from './remotePairingHttp'

export const REMOTE_RECONNECT_BASE_DELAY_MS = PAIRING_REMOTE_RECONNECT_BASE_DELAY_MS
export const REMOTE_RECONNECT_MAX_DELAY_MS = PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS
const HTTP_RETRY_MIN_STATUS = 500
const HTTP_REQUEST_TIMEOUT_STATUS = 408
const HTTP_RATE_LIMIT_STATUS = 429
const RECONNECT_CHALLENGE_EXPIRED = 'Missing or expired reconnect challenge'

export function getRemoteReconnectDelay(attempt: number): number {
    const safeAttempt = Math.max(0, attempt)
    return Math.min(REMOTE_RECONNECT_BASE_DELAY_MS * 2 ** safeAttempt, REMOTE_RECONNECT_MAX_DELAY_MS)
}

export function isRecoverableRemotePairingError(error: unknown): boolean {
    if (error instanceof RemotePeerConnectError) {
        return error.kind !== 'expired'
    }
    if (error instanceof RemotePairingHttpError) {
        return (
            error.status >= HTTP_RETRY_MIN_STATUS ||
            error.status === HTTP_REQUEST_TIMEOUT_STATUS ||
            error.status === HTTP_RATE_LIMIT_STATUS ||
            error.serverCode === 'pairing_reconnect_challenge_expired' ||
            error.serverError === RECONNECT_CHALLENGE_EXPIRED
        )
    }
    if (isBrowserStorageUnavailableError(error) || isAppCacheUnavailableError(error)) return true
    return error instanceof TypeError
}
