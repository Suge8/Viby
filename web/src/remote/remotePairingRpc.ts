import { type PairingPeerMessage, PairingPeerMessageSchema, type PairingPeerRequest } from '@viby/protocol'

function createRequestId(): string {
    return crypto.randomUUID()
}

export function parsePeerMessage(data: string): PairingPeerMessage | null {
    try {
        return PairingPeerMessageSchema.parse(JSON.parse(data) as unknown)
    } catch {
        return null
    }
}

export function createRemotePeerRequest(method: PairingPeerRequest['method'], params?: unknown): PairingPeerRequest {
    const id = createRequestId()
    if (method === 'sessions.list') {
        return { kind: 'request', id, method, params: {} }
    }
    return { kind: 'request', id, method, params } as PairingPeerRequest
}
