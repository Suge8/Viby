import { randomUUID } from 'node:crypto'
import type { CliSocketWithData } from '../../socketTypes'
import type { SessionHandlersDeps, UpdateMetadataHandler, UpdateStateHandler } from './sessionHandlerSupport'
import {
    mergeSessionMetadataPreservingLifecycle,
    updateMetadataSchema,
    updateStateSchema,
} from './sessionHandlerSupport'

export function registerSessionMutationHandlers(socket: CliSocketWithData, deps: SessionHandlersDeps): void {
    const { store, resolveSessionAccess, onWebappEvent } = deps

    const handleUpdateMetadata: UpdateMetadataHandler = (data, cb) => {
        const parsed = updateMetadataSchema.safeParse(data)
        if (!parsed.success) {
            cb({ result: 'error' })
            return
        }

        const { sid, metadata, expectedVersion, touchUpdatedAt } = parsed.data
        const sessionAccess = resolveSessionAccess(sid)
        if (!sessionAccess.ok) {
            cb({ result: 'error', reason: sessionAccess.reason })
            return
        }

        const protectedMetadata = mergeSessionMetadataPreservingLifecycle(sessionAccess.value.metadata, metadata)
        const result = store.sessions.updateSessionMetadata(sid, protectedMetadata, expectedVersion, { touchUpdatedAt })
        if (result.result === 'success') {
            cb({ result: 'success', version: result.version, metadata: result.value })
        } else if (result.result === 'version-mismatch') {
            cb({ result: 'version-mismatch', version: result.version, metadata: result.value })
        } else {
            cb({ result: 'error' })
        }

        if (result.result !== 'success') {
            return
        }

        socket.to(`session:${sid}`).emit('update', {
            id: randomUUID(),
            seq: Date.now(),
            createdAt: Date.now(),
            body: {
                t: 'update-session',
                sid,
                metadata: { version: result.version, value: protectedMetadata },
                agentState: null,
            },
        })
        onWebappEvent?.({ type: 'session-updated', sessionId: sid, data: { sid } })
    }

    const handleUpdateState: UpdateStateHandler = (data, cb) => {
        const parsed = updateStateSchema.safeParse(data)
        if (!parsed.success) {
            cb({ result: 'error' })
            return
        }

        const { sid, agentState, expectedVersion } = parsed.data
        const sessionAccess = resolveSessionAccess(sid)
        if (!sessionAccess.ok) {
            cb({ result: 'error', reason: sessionAccess.reason })
            return
        }

        const result = store.sessions.updateSessionAgentState(sid, agentState, expectedVersion)
        if (result.result === 'success') {
            cb({ result: 'success', version: result.version, agentState: result.value })
        } else if (result.result === 'version-mismatch') {
            cb({ result: 'version-mismatch', version: result.version, agentState: result.value })
        } else {
            cb({ result: 'error' })
        }

        if (result.result !== 'success') {
            return
        }

        socket.to(`session:${sid}`).emit('update', {
            id: randomUUID(),
            seq: Date.now(),
            createdAt: Date.now(),
            body: {
                t: 'update-session',
                sid,
                metadata: null,
                agentState: { version: result.version, value: agentState },
            },
        })
        onWebappEvent?.({ type: 'session-updated', sessionId: sid, data: { sid } })
    }

    socket.on('update-metadata', handleUpdateMetadata)
    socket.on('update-state', handleUpdateState)
}
