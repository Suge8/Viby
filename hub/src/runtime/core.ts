import { NotificationHub } from '../notifications/notificationHub'
import type { NotificationChannel } from '../notifications/notificationTypes'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { SocketServer } from '../socket/socketTypes'
import type { WebRealtimeManager } from '../socket/webRealtimeManager'
import type { Store } from '../store'
import { SyncEngine } from '../sync/syncEngine'

export type HubRuntimeCore = {
    readonly syncEngine: SyncEngine
    dispose(): void
}

export type CreateHubRuntimeCoreOptions = {
    readonly store: Store
    readonly io: SocketServer
    readonly rpcRegistry: RpcRegistry
    readonly webRealtimeManager: WebRealtimeManager
    readonly notificationChannels: NotificationChannel[]
}

export function createHubRuntimeCore(options: CreateHubRuntimeCoreOptions): HubRuntimeCore {
    const syncEngine = new SyncEngine(
        options.store,
        options.io,
        options.rpcRegistry,
        options.webRealtimeManager
    )
    const notificationHub = new NotificationHub(syncEngine, options.notificationChannels)

    return {
        syncEngine,
        dispose(): void {
            notificationHub.stop()
            syncEngine.stop()
        }
    }
}
