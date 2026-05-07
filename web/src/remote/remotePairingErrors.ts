type TranslationFn = (key: string) => string

export type RemotePairingErrorKey =
    | 'remotePairing.error.fallback'
    | 'remotePairing.error.regenerateQr'
    | 'remotePairing.error.scanAgain'
    | 'remotePairing.error.invalidCode'
    | 'remotePairing.error.rateLimited'
    | 'remotePairing.error.hostUnavailable'
    | 'remotePairing.error.hostClosed'
    | 'remotePairing.error.p2pTimedOut'
    | 'remotePairing.error.p2pBlocked'
    | 'remotePairing.error.closedRetrying'
    | 'remotePairing.error.closedScanAgain'
    | 'remotePairing.error.socket'
    | 'remotePairing.error.expired'
    | 'remotePairing.error.peerNotConnected'
    | 'remotePairing.error.peerTimeout'
    | 'remotePairing.error.peerRequestFailed'
    | 'remotePairing.error.uploadFailed'
    | 'remotePairing.error.closed'

const REMOTE_PAIRING_ERROR_KEYS = new Set<string>([
    'remotePairing.error.fallback',
    'remotePairing.error.regenerateQr',
    'remotePairing.error.scanAgain',
    'remotePairing.error.invalidCode',
    'remotePairing.error.rateLimited',
    'remotePairing.error.hostUnavailable',
    'remotePairing.error.hostClosed',
    'remotePairing.error.p2pTimedOut',
    'remotePairing.error.p2pBlocked',
    'remotePairing.error.closedRetrying',
    'remotePairing.error.closedScanAgain',
    'remotePairing.error.socket',
    'remotePairing.error.expired',
    'remotePairing.error.peerNotConnected',
    'remotePairing.error.peerTimeout',
    'remotePairing.error.peerRequestFailed',
    'remotePairing.error.uploadFailed',
    'remotePairing.error.closed',
])

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
        key === 'remotePairing.error.expired' ||
        key === 'remotePairing.error.closedScanAgain'
    )
}

export function getRemotePairingErrorKeyOrFallback(error: unknown): RemotePairingErrorKey {
    return getRemotePairingErrorKey(error) ?? 'remotePairing.error.fallback'
}

export function getRemotePairingErrorMessage(error: unknown, t: TranslationFn): string {
    return t(getRemotePairingErrorKeyOrFallback(error))
}
