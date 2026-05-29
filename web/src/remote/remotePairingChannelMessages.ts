import { PairingPeerEventSchema, type PairingPeerHeartbeat, type PairingPeerTerminalEventPayload } from '@viby/protocol'
import type { PairingPeerTextAssembler } from '@viby/protocol/pairing'
import type { SyncEvent } from '@/types/api'
import type { RemotePeerPendingRequests } from './remotePairingPendingRequests'
import { parsePeerMessage } from './remotePairingRpc'

export function handleRemotePeerChannelMessage(options: {
    data: unknown
    textAssembler?: PairingPeerTextAssembler
    pendingRequests: RemotePeerPendingRequests
    syncListeners: ReadonlySet<(event: SyncEvent) => void>
    terminalListeners: ReadonlySet<(event: PairingPeerTerminalEventPayload) => void>
    onHeartbeat?: (heartbeat: PairingPeerHeartbeat) => void
}): void {
    if (typeof options.data !== 'string') {
        return
    }

    const rawMessage = options.textAssembler ? options.textAssembler.accept(options.data) : options.data
    if (rawMessage === null) return

    const message = parsePeerMessage(rawMessage)
    if (!message) {
        return
    }
    if (message.kind === 'heartbeat') {
        options.onHeartbeat?.(message)
        return
    }
    if (message.kind === 'event') {
        const parsed = PairingPeerEventSchema.parse(message)
        if (parsed.event === 'sync-event') {
            for (const listener of options.syncListeners) {
                listener(parsed.payload)
            }
            return
        }
        for (const listener of options.terminalListeners) {
            listener(parsed.payload)
        }
        return
    }
    if (message.kind === 'response') {
        options.pendingRequests.resolveResponse(message)
    }
}
