import { NotificationHub } from '../notifications/notificationHub'
import type { NotificationChannel } from '../notifications/notificationTypes'
import type { WebRealtimeManager } from '../socket/webRealtimeManager'
import type { Store } from '../store'
import type { SessionStreamManager } from '../sync/sessionStreamManager'
import { SyncEngine } from '../sync/syncEngine'
import type { DirectRuntimeRegistry } from './directRuntimeRegistry'

export type HubRuntimeCore = {
    readonly syncEngine: SyncEngine
    dispose(): void
}

export type CreateHubRuntimeCoreOptions = {
    readonly store: Store
    readonly webRealtimeManager: WebRealtimeManager
    readonly sessionStreamManager: SessionStreamManager
    readonly notificationChannels: NotificationChannel[]
    readonly directRuntimeRegistry: DirectRuntimeRegistry
}

export function createHubRuntimeCore(options: CreateHubRuntimeCoreOptions): HubRuntimeCore {
    const syncEngine = new SyncEngine(options.store, options.webRealtimeManager, {
        directRuntimeRegistry: options.directRuntimeRegistry,
        sessionStreamManager: options.sessionStreamManager,
    })
    const notificationHub = new NotificationHub(syncEngine, options.notificationChannels)

    return {
        syncEngine,
        dispose(): void {
            notificationHub.stop()
            syncEngine.stop()
        },
    }
}
