import type { PairingByeReason, PairingRole } from '@viby/protocol/pairing'
import type { ConnectionState, PairingSocketLike } from './wsTypes'

const READY_STATE_OPEN = 1
type PairingSocketMessageSchema = { parse(value: unknown): unknown }

export function createEmptyState(): ConnectionState {
    return {
        sockets: new Map<PairingRole, PairingSocketLike>(),
        disconnectTimers: new Map<PairingRole, ReturnType<typeof setTimeout>>(),
    }
}

export function oppositeRole(role: PairingRole): PairingRole {
    return role === 'host' ? 'guest' : 'host'
}

export function sendBye(socket: PairingSocketLike, reason: PairingByeReason): void {
    if (socket.readyState === READY_STATE_OPEN) {
        socket.send(JSON.stringify({ type: 'bye', reason }))
    }
}

export async function readRawText(rawData: string | ArrayBuffer | SharedArrayBuffer | Blob): Promise<string | null> {
    if (typeof rawData === 'string') return rawData
    if (rawData instanceof Blob) return await rawData.text()
    const bytes = rawData instanceof ArrayBuffer ? new Uint8Array(rawData) : new Uint8Array(rawData)
    return new TextDecoder().decode(bytes)
}

export function parseSocketMessage(rawText: string, schema: PairingSocketMessageSchema): unknown | null {
    try {
        return schema.parse(JSON.parse(rawText) as unknown)
    } catch {
        return null
    }
}
