import type { Session, SyncEvent } from '@viby/protocol/types'
import type { Server } from 'socket.io'
import { RpcRegistry } from '../socket/rpcRegistry'
import { Store } from '../store'
import type { EventPublisher } from './eventPublisher'
import { SessionCache } from './sessionCache'
import { SyncEngine } from './syncEngine'

export function createPublisher(events: SyncEvent[]): EventPublisher {
    return {
        emit: (event: SyncEvent) => {
            events.push(event)
        },
    } as unknown as EventPublisher
}

export function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {},
                    }
                },
            }
        },
    } as unknown as Server
}

type CacheSessionInput = Omit<Parameters<SessionCache['getOrCreateSession']>[0], 'agentState'> & {
    agentState?: unknown
}
type EngineSessionInput = Omit<Parameters<SyncEngine['getOrCreateSession']>[0], 'agentState'> & {
    agentState?: unknown
}

export function createCachedSession(cache: SessionCache, input: CacheSessionInput): Session {
    const { agentState = null, ...rest } = input
    return cache.getOrCreateSession({
        ...rest,
        agentState,
    })
}

export function createEngineSession(engine: SyncEngine, input: EngineSessionInput): Session {
    const { agentState = null, ...rest } = input
    return engine.getOrCreateSession({
        ...rest,
        agentState,
    })
}

export { RpcRegistry, SessionCache, Store, SyncEngine }
