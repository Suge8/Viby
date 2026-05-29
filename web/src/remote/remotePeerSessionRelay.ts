import { createRemoteRelayHeartbeat, type RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import { createRemotePairingRelaySocket, type RemotePairingRelaySocket } from './remotePairingRelaySocket'

export function createRemotePeerSessionRelay(options: {
    onClose(): void
    onFatal(): void
    onMessage(data: string): void
    onOpen(): void
    onHeartbeatTimeout(): void
    tunnelUrl: string
}): { heartbeat: RemoteRelayHeartbeat; relay: RemotePairingRelaySocket } {
    let relay!: RemotePairingRelaySocket
    const heartbeat = createRemoteRelayHeartbeat({ getRelay: () => relay, onTimeout: options.onHeartbeatTimeout })
    relay = createRemotePairingRelaySocket({
        tunnelUrl: options.tunnelUrl,
        onOpen: () => {
            heartbeat.start()
            options.onOpen()
        },
        onClose: () => {
            heartbeat.stop()
            options.onClose()
        },
        onFatal: options.onFatal,
        onMessage: options.onMessage,
    })
    return { heartbeat, relay }
}
