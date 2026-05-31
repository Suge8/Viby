import type { PairingByeReason } from '@viby/protocol/pairing'

type TranslationFn = (key: string) => string

export type RemotePairingErrorKey =
    | 'remotePairing.error.regenerateQr'
    | 'remotePairing.error.scanAgain'
    | 'remotePairing.error.invalidCode'
    | 'remotePairing.error.rateLimited'
    | 'remotePairing.error.closedRetrying'
    | 'remotePairing.error.connectionReplaced'
    | 'remotePairing.error.hostOffline'
    | 'remotePairing.error.peerRequestFailed'
    | 'remotePairing.error.uploadFailed'
    | 'remotePairing.error.pairingUnavailable'
    | 'remotePairing.error.updateDesktop'
    | 'remotePairing.error.userCancelled'

const REMOTE_PAIRING_ERROR_KEYS = new Set<string>([
    'remotePairing.error.regenerateQr',
    'remotePairing.error.scanAgain',
    'remotePairing.error.invalidCode',
    'remotePairing.error.rateLimited',
    'remotePairing.error.hostOffline',
    'remotePairing.error.closedRetrying',
    'remotePairing.error.connectionReplaced',
    'remotePairing.error.peerRequestFailed',
    'remotePairing.error.uploadFailed',
    'remotePairing.error.pairingUnavailable',
    'remotePairing.error.updateDesktop',
    'remotePairing.error.userCancelled',
])

export class RemotePeerConnectError extends Error {
    constructor(
        readonly kind: string,
        readonly code: RemotePairingErrorKey
    ) {
        super(code)
        this.name = 'RemotePeerConnectError'
    }
}

export function createRemoteRelayFatalError(reason: string): RemotePeerConnectError {
    return reason === 'replaced'
        ? new RemotePeerConnectError('replaced', 'remotePairing.error.connectionReplaced')
        : new RemotePeerConnectError('closed', 'remotePairing.error.scanAgain')
}

export class RemotePairingCodedError extends Error {
    constructor(
        readonly code: RemotePairingErrorKey,
        name = 'RemotePairingError'
    ) {
        super(code)
        this.name = name
    }
}

export function isRemotePairingErrorKey(value: unknown): value is RemotePairingErrorKey {
    return typeof value === 'string' && REMOTE_PAIRING_ERROR_KEYS.has(value)
}

export function createRemotePairingCodedError(code: RemotePairingErrorKey, name?: string): Error {
    return new RemotePairingCodedError(code, name)
}

export function createRemotePairingUserError(key: RemotePairingErrorKey): Error {
    return createRemotePairingCodedError(key, 'RemotePairingUserError')
}

export function getRemotePairingErrorKey(error: unknown): RemotePairingErrorKey | null {
    if (isRemotePairingErrorKey(error)) return error
    if (!error || typeof error !== 'object') return null

    const record = error as { code?: unknown; key?: unknown; message?: unknown }
    if (isRemotePairingErrorKey(record.code)) return record.code
    if (isRemotePairingErrorKey(record.key)) return record.key
    return isRemotePairingErrorKey(record.message) ? record.message : null
}

export function canRetryRemotePairingError(key: RemotePairingErrorKey): boolean {
    return !(
        key === 'remotePairing.error.regenerateQr' ||
        key === 'remotePairing.error.scanAgain' ||
        key === 'remotePairing.error.connectionReplaced' ||
        key === 'remotePairing.error.updateDesktop'
    )
}

export function getRemotePairingErrorKeyOrFallback(error: unknown): RemotePairingErrorKey {
    return getRemotePairingErrorKey(error) ?? 'remotePairing.error.closedRetrying'
}

export function mapByeToErrorKey(reason: PairingByeReason): RemotePairingErrorKey {
    switch (reason) {
        case 'invalid_device_proof':
        case 'handoff_invalid':
            return 'remotePairing.error.regenerateQr'
        case 'pairing_unavailable':
        case 'user_revoked':
            return 'remotePairing.error.pairingUnavailable'
        case 'invalid_token':
            return 'remotePairing.error.scanAgain'
    }
}

export function getRemotePairingErrorMessage(error: unknown, t: TranslationFn): string {
    return t(getRemotePairingErrorKeyOrFallback(error))
}
