import type { PairingRole } from '@viby/protocol/pairing'
import type { PairingConnection, PairingSocketLike } from './wsTypes'

type PairingSocketData = { connectionKey?: string }

export function buildPairingConnectionKey(pairingId: string, role: PairingRole, tokenHash: string): string {
    return `${pairingId}:${role}:${tokenHash}`
}

export class PairingConnectionIndex {
    private readonly socketIndex = new Map<PairingSocketLike, PairingConnection>()
    private readonly connectionIndex = new Map<string, PairingConnection>()

    set(socket: PairingSocketLike, connection: PairingConnection): void {
        this.writeSocketData(socket, connection.connectionKey)
        this.socketIndex.set(socket, connection)
        this.connectionIndex.set(connection.connectionKey, connection)
    }

    deleteSocket(socket: PairingSocketLike): void {
        this.socketIndex.delete(socket)
    }

    deleteSession(pairingId: string, sockets: Iterable<PairingSocketLike>): void {
        for (const socket of sockets) this.socketIndex.delete(socket)
        for (const [connectionKey, connection] of this.connectionIndex) {
            if (connection.pairingId === pairingId) this.connectionIndex.delete(connectionKey)
        }
    }

    resolve(socket: PairingSocketLike): PairingConnection | null {
        const indexed = this.socketIndex.get(socket)
        if (indexed) return indexed

        const connectionKey = this.readSocketConnectionKey(socket)
        if (!connectionKey) return null

        const connection = this.connectionIndex.get(connectionKey)
        if (!connection) return null

        this.socketIndex.set(socket, connection)
        return connection
    }

    private readSocketConnectionKey(socket: PairingSocketLike): string | null {
        const socketData = typeof socket.data === 'object' && socket.data ? (socket.data as PairingSocketData) : null
        return socketData?.connectionKey ?? null
    }

    private writeSocketData(socket: PairingSocketLike, connectionKey: string): void {
        socket.data = {
            ...(typeof socket.data === 'object' && socket.data ? socket.data : {}),
            connectionKey,
        }
    }
}
