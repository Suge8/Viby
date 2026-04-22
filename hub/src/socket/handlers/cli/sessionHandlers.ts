import type { CliSocketWithData } from '../../socketTypes'
import { type SessionAlivePayload, type SessionEndPayload, type SessionHandlersDeps } from './sessionHandlerSupport'
import { registerSessionMessageHandlers } from './sessionMessageHandlers'
import { registerSessionMutationHandlers } from './sessionMutationHandlers'

export { mergeSessionMetadataPreservingLifecycle } from './sessionHandlerSupport'

export function registerSessionHandlers(socket: CliSocketWithData, deps: SessionHandlersDeps): void {
    const { resolveSessionAccess, emitAccessError, sessionStreamManager, onSessionAlive, onSessionEnd, onWebappEvent } =
        deps

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

    socket.on('session-end', (data: SessionEndPayload) => {
        if (!data || typeof data.sid !== 'string' || typeof data.time !== 'number') {
            return
        }
        const sessionAccess = resolveSessionAccess(data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', data.sid, sessionAccess.reason)
            return
        }
        const event = sessionStreamManager.clear(data.sid)
        if (event) {
            onWebappEvent?.(event)
        }
        onSessionEnd?.(data)
    })
}
