import type { PairingRole } from '@viby/protocol/pairing'
import type { PairingConnection, PairingSocketLike } from './wsTypes'

const DEFAULT_MAX_BUFFERED_MESSAGES_PER_ROLE = 128
const SOCKET_OPEN = 1

export class PairingPendingSocketMessages {
    private readonly sessions = new Map<string, Map<PairingRole, string[]>>()

    constructor(private readonly maxPerRole = DEFAULT_MAX_BUFFERED_MESSAGES_PER_ROLE) {}

    enqueue(pairingId: string, role: PairingRole, message: string): void {
        const roles = this.sessions.get(pairingId) ?? new Map<PairingRole, string[]>()
        const messages = roles.get(role) ?? []
        messages.push(message)
        if (messages.length > this.maxPerRole) messages.splice(0, messages.length - this.maxPerRole)
        roles.set(role, messages)
        this.sessions.set(pairingId, roles)
    }

    drain(pairingId: string, role: PairingRole): string[] {
        const roles = this.sessions.get(pairingId)
        const messages = roles?.get(role) ?? []
        roles?.delete(role)
        if (roles && roles.size === 0) this.sessions.delete(pairingId)
        return messages
    }

    deleteSession(pairingId: string): void {
        this.sessions.delete(pairingId)
    }
}

export function sendOrBufferSocketMessage(options: {
    bufferMessages?: boolean
    connection: PairingConnection
    pendingMessages: PairingPendingSocketMessages
    rawText: string
    shouldBufferMessage?: (rawText: string) => boolean
    target: PairingSocketLike | undefined
    targetRole: PairingRole
}): void {
    if (options.target?.readyState === SOCKET_OPEN) {
        options.target.send(options.rawText)
        return
    }
    if (options.bufferMessages && (options.shouldBufferMessage?.(options.rawText) ?? true)) {
        options.pendingMessages.enqueue(options.connection.pairingId, options.targetRole, options.rawText)
    }
}

export function flushPendingSocketMessages(options: {
    bufferMessages?: boolean
    pairingId: string
    pendingMessages: PairingPendingSocketMessages
    role: PairingRole
    socket: PairingSocketLike
}): void {
    if (!options.bufferMessages || options.socket.readyState !== SOCKET_OPEN) return
    for (const message of options.pendingMessages.drain(options.pairingId, options.role)) options.socket.send(message)
}
