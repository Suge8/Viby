import type { Session, SyncEvent } from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { RpcRegistry } from '../socket/rpcRegistry'
import type { Store } from '../store'
import { EventPublisher, type SyncEventBroadcaster } from './eventPublisher'
import { LocalSessionRecoveryService } from './localSessionRecoveryService'
import { type Machine, MachineCache } from './machineCache'
import { MessageService } from './messageService'
import { RpcGateway } from './rpcGateway'
import { SessionBootstrapConfigService } from './sessionBootstrapConfigService'
import { SessionCache } from './sessionCache'
import { SessionHandoffService } from './sessionHandoffService'
import { SessionInteractionService, type SessionSendMessageErrorCode } from './sessionInteractionService'
import { SessionLifecycleService } from './sessionLifecycleService'
import { SessionRpcFacade } from './sessionRpcFacade'
import { SyncEngineStateFacade } from './syncEngineStateFacade'

type SyncEngineResumeResult = Awaited<ReturnType<SessionLifecycleService['resumeSession']>>
type SyncEngineSpawnResult = Awaited<ReturnType<SessionRpcFacade['spawnSession']>>

export type SyncEngineServiceFactoryOptions = {
    store: Store
    io: Server
    rpcRegistry: RpcRegistry
    broadcaster: SyncEventBroadcaster
    getSession: (sessionId: string) => ReturnType<SessionCache['getSession']>
    getMessagesAfter: (
        sessionId: string,
        args: { afterSeq: number; limit: number }
    ) => ReturnType<MessageService['getMessagesAfter']>
    appendInternalUserMessage: (
        sessionId: string,
        payload: Parameters<SessionInteractionService['appendInternalUserMessage']>[1]
    ) => Promise<Session>
    appendPassiveInternalUserMessage: (
        sessionId: string,
        payload: Parameters<SessionInteractionService['appendPassiveInternalUserMessage']>[1]
    ) => Promise<Session>
    ensurePassiveInternalUserMessageTarget: (sessionId: string) => Promise<void>
    resumeSession: (sessionId: string) => Promise<SyncEngineResumeResult>
    unarchiveSession: (sessionId: string) => Promise<Session>
    handleRealtimeEvent: (event: SyncEvent) => void
    createSendError: (message: string, code: SessionSendMessageErrorCode, status: 404 | 409) => Error
    spawnSession: (spawnOptions: Parameters<SessionRpcFacade['spawnSession']>[0]) => Promise<SyncEngineSpawnResult>
    eventEmitter: (event: Parameters<EventPublisher['emit']>[0]) => void
}

export function createSyncEngineServices(options: SyncEngineServiceFactoryOptions) {
    const eventPublisher = new EventPublisher(options.broadcaster)
    const sessionCache = new SessionCache(options.store, eventPublisher)
    const machineCache = new MachineCache(options.store, eventPublisher)
    const messageService = new MessageService(options.store, options.io, eventPublisher)
    const sessionHandoffService = new SessionHandoffService({
        getSession: options.getSession,
        getMessagesAfter: options.getMessagesAfter,
    })
    const rpcGateway = new RpcGateway(options.io, options.rpcRegistry)
    const sessionRpcFacade = new SessionRpcFacade(rpcGateway, (sessionId, config) =>
        sessionCache.applySessionConfig(sessionId, config)
    )
    const sessionLifecycleService = new SessionLifecycleService(sessionCache, machineCache, rpcGateway)
    const sessionBootstrapConfigService = new SessionBootstrapConfigService(
        options.getSession,
        async (sessionId, buildNextMetadata, mutateOptions) => {
            return await sessionCache.mutateSessionMetadata(sessionId, buildNextMetadata, mutateOptions)
        },
        (sessionId, config) => sessionCache.applySessionConfig(sessionId, config)
    )
    const localSessionRecoveryService = new LocalSessionRecoveryService(options.store, sessionCache, sessionRpcFacade)
    const sessionInteractionService = new SessionInteractionService({
        getSession: options.getSession,
        hasMessages: (sessionId) => messageService.hasMessages(sessionId),
        startSession: (sessionId) => sessionLifecycleService.startSession(sessionId),
        resumeSession: async (sessionId) => await options.resumeSession(sessionId),
        unarchiveSession: async (sessionId) => await options.unarchiveSession(sessionId),
        appendUserMessage: async (sessionId, payload) => {
            await messageService.appendUserMessage(sessionId, payload)
        },
        refreshSession: (sessionId) => sessionCache.refreshSession(sessionId),
        uploadFile: async (machineId, sessionId, filename, content, mimeType) =>
            await sessionRpcFacade.uploadFile(machineId, sessionId, filename, content, mimeType),
        deleteUploadFile: async (machineId, sessionId, path) =>
            await sessionRpcFacade.deleteUploadFile(machineId, sessionId, path),
        onCommandCapabilitiesInvalidated: (sessionId) => {
            eventPublisher.emit({
                type: 'command-capabilities-invalidated',
                sessionId,
            })
        },
        createSendError: options.createSendError,
    })
    const stateFacade = new SyncEngineStateFacade(
        sessionCache,
        machineCache,
        messageService,
        sessionHandoffService,
        options.eventEmitter
    )

    return {
        eventPublisher,
        machineCache,
        messageService,
        localSessionRecoveryService,
        rpcGateway,
        sessionBootstrapConfigService,
        sessionCache,
        sessionHandoffService,
        sessionInteractionService,
        sessionLifecycleService,
        sessionRpcFacade,
        stateFacade,
    }
}

export type SyncEngineServices = ReturnType<typeof createSyncEngineServices>
