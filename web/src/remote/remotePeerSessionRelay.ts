import { createRemoteRelayHeartbeat, type RemoteRelayHeartbeat } from './remotePairingRelayHeartbeat'
import {
    createRemotePairingRelaySocket,
    type RemotePairingRelaySocket,
    type RemotePairingRelayWebSocket,
} from './remotePairingRelaySocket'

type ScheduleInterval = (callback: () => void, intervalMs: number) => () => void
type ScheduleTimeout = (callback: () => void, delayMs: number) => () => void

export function createRemotePeerSessionRelay(options: {
    onClose(): void
    onFatal(reason: string): void
    onMessage(data: string): void
    onOpen(): void
    onHeartbeatTimeout(): void
    getLastSeenSeq?: () => number
    tunnelUrl: string
    // Injectable clock seams (default to the browser's wall clock / timers) so
    // the suspended-socket recovery path is deterministically testable.
    now?: () => number
    randomJitter?: () => number
    scheduleInterval?: ScheduleInterval
    scheduleTimeout?: ScheduleTimeout
    socketFactory?: (url: string) => RemotePairingRelayWebSocket
}): { heartbeat: RemoteRelayHeartbeat; relay: RemotePairingRelaySocket } {
    let relay!: RemotePairingRelaySocket
    const heartbeat = createRemoteRelayHeartbeat({
        getRelay: () => relay,
        getLastSeenSeq: options.getLastSeenSeq,
        onTimeout: options.onHeartbeatTimeout,
        now: options.now,
        scheduleInterval: options.scheduleInterval,
        scheduleTimeout: options.scheduleTimeout,
    })
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
        randomJitter: options.randomJitter,
        scheduleTimeout: options.scheduleTimeout,
        socketFactory: options.socketFactory,
    })
    return { heartbeat, relay }
}
