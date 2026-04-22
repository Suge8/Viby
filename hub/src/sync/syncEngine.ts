import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { Store } from '../store'
import type { SyncEventBroadcaster } from './eventPublisher'
import { SessionSendMessageError } from './syncEngineExports'
import { createSyncEngineServices, type SyncEngineServices } from './syncEngineServiceFactory'
import { SyncEngineSessionApi } from './syncEngineSessionApi'

export * from './syncEngineExports'

const INACTIVITY_SWEEP_INTERVAL_MS = 5_000

export class SyncEngine extends SyncEngineSessionApi {
    private readonly syncServicesContainer: SyncEngineServices
    readonly sessionCache: SyncEngineServices['sessionCache']
    readonly rpcGateway: SyncEngineServices['rpcGateway']
    readonly messageService: SyncEngineServices['messageService']
    readonly sessionLifecycleService: SyncEngineServices['sessionLifecycleService']
    private inactivityTimer: NodeJS.Timeout | null = null

    constructor(store: Store, io: Server, rpcRegistry: RpcRegistry, broadcaster: SyncEventBroadcaster) {
        super()
        const services = createSyncEngineServices({
            store,
            io,
            rpcRegistry,
            broadcaster,
            getSession: (sessionId) => this.getSession(sessionId),
            getMessagesAfter: (sessionId, options) =>
                this.syncServices.messageService.getMessagesAfter(sessionId, options),
            appendInternalUserMessage: async (sessionId, payload) =>
                await this.appendInternalUserMessage(sessionId, payload),
            appendPassiveInternalUserMessage: async (sessionId, payload) =>
                await this.appendPassiveInternalUserMessage(sessionId, payload),
            ensurePassiveInternalUserMessageTarget: async (sessionId) => {
                await this.syncServices.sessionInteractionService.ensurePassiveInternalUserMessageTarget(sessionId)
            },
            resumeSession: async (sessionId) => await this.resumeSession(sessionId),
            unarchiveSession: async (sessionId) => await this.unarchiveSession(sessionId),
            handleRealtimeEvent: (event) => {
                this.handleRealtimeEvent(event)
            },
            createSendError: (message, code, status) => new SessionSendMessageError(message, code, status),
            spawnSession: async (options) => await this.spawnSession(options),
            eventEmitter: (event) => this.syncServices.eventPublisher.emit(event),
        })

        this.syncServicesContainer = services
        this.sessionCache = services.sessionCache
        this.rpcGateway = services.rpcGateway
        this.messageService = services.messageService
        this.sessionLifecycleService = services.sessionLifecycleService
        this.reloadAll()
        this.inactivityTimer = setInterval(() => this.expireInactive(), INACTIVITY_SWEEP_INTERVAL_MS)
    }

    protected get syncServices(): SyncEngineServices {
        return this.syncServicesContainer
    }

    stop(): void {
        if (!this.inactivityTimer) {
            return
        }

        clearInterval(this.inactivityTimer)
        this.inactivityTimer = null
    }
}
