import type { CliSocketWithData } from '../../socketTypes'
import {
    type SessionAlivePayload,
    type SessionEndPayload,
    type SessionHandlersDeps,
    sessionRuntimeStateSchema,
} from './sessionHandlerSupport'
import { registerSessionMessageHandlers } from './sessionMessageHandlers'
import { registerSessionMutationHandlers } from './sessionMutationHandlers'

export { mergeSessionMetadataPreservingLifecycle } from './sessionHandlerSupport'

export function registerSessionHandlers(socket: CliSocketWithData, deps: SessionHandlersDeps): void {
    const {
        store,
        resolveSessionAccess,
        emitAccessError,
        sessionStreamManager,
        onSessionAlive,
        onSessionEnd,
        onSessionRuntimeState,
        onWebappEvent,
    } = deps

    registerSessionMessageHandlers(socket, deps)
    registerSessionMutationHandlers(socket, deps)

    socket.on('session-alive', (data: SessionAlivePayload) => {
        if (!data || typeof data.sid !== 'string' || typeof data.time !== 'number') {
            return
        }
        const sessionAccess = resolveSessionAccess(data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', data.sid, sessionAccess.reason)
            return
        }
        onSessionAlive?.(data)
    })

    socket.on('session-runtime-state', (data) => {
        const parsed = sessionRuntimeStateSchema.safeParse(data)
        if (!parsed.success) {
            return
        }
        const sessionAccess = resolveSessionAccess(parsed.data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', parsed.data.sid, sessionAccess.reason)
            return
        }
        onSessionRuntimeState?.(parsed.data)
    })

    socket.on('session-end', (data: SessionEndPayload) => {
        if (!data || typeof data.sid !== 'string' || typeof data.time !== 'number') {
            return
        }
        const sessionAccess = resolveSessionAccess(data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', data.sid, sessionAccess.reason)
            return
        }

        const queued = store.messages.getUninvokedLocalMessages(data.sid)
        const localIds = queued
            .map((message) => message.localId)
            .filter((localId): localId is string => typeof localId === 'string')
        if (localIds.length > 0) {
            const invokedAt = Date.now()
            store.messages.markMessagesInvoked(data.sid, localIds, invokedAt)
            onWebappEvent?.({
                type: 'messages-consumed',
                sessionId: data.sid,
                localIds,
                invokedAt,
            })
        }

        const event = sessionStreamManager.clear(data.sid)
        if (event) {
            onWebappEvent?.(event)
        }
        onSessionEnd?.(data)
    })
}
