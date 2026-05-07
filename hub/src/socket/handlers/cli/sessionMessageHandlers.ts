import { randomUUID } from 'node:crypto'
import { extractAssistantTurnId, SessionStreamUpdatePayloadSchema } from '@viby/protocol'
import { extractTodoWriteTodosFromMessageContent } from '../../../sync/todos'
import type { CliSocketWithData } from '../../socketTypes'
import type {
    CommandCapabilitiesInvalidatedHandler,
    MessagesCanceledHandler,
    MessagesConsumedHandler,
    SessionHandlersDeps,
} from './sessionHandlerSupport'
import {
    commandCapabilitiesInvalidatedSchema,
    messageSchema,
    parseMessageContent,
    queuedMessageLocalIdsSchema,
} from './sessionHandlerSupport'

export function registerSessionMessageHandlers(socket: CliSocketWithData, deps: SessionHandlersDeps): void {
    const { store, sessionStreamManager, resolveSessionAccess, emitAccessError, onWebappEvent } = deps

    socket.on('message', (data: unknown) => {
        const parsed = messageSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const { sid, localId, message } = parsed.data
        const sessionAccess = resolveSessionAccess(sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', sid, sessionAccess.reason)
            return
        }

        const content = parseMessageContent(message)
        const assistantTurnId = extractAssistantTurnId(content)
        if (assistantTurnId) {
            sessionStreamManager.drop(sid, assistantTurnId)
        }

        const storedMessage = store.messages.addMessage(sid, content, localId)
        const todos = extractTodoWriteTodosFromMessageContent(content)
        if (todos) {
            const updated = store.sessions.setSessionTodos(sid, todos, storedMessage.createdAt)
            if (updated) {
                onWebappEvent?.({ type: 'session-updated', sessionId: sid, data: { sid } })
            }
        }

        socket.to(`session:${sid}`).emit('update', {
            id: randomUUID(),
            seq: storedMessage.seq,
            createdAt: Date.now(),
            body: {
                t: 'new-message',
                sid,
                message: {
                    id: storedMessage.id,
                    seq: storedMessage.seq,
                    createdAt: storedMessage.createdAt,
                    localId: storedMessage.localId,
                    invokedAt: storedMessage.invokedAt,
                    content: storedMessage.content,
                },
            },
        })

        onWebappEvent?.({
            type: 'message-received',
            sessionId: sid,
            message: {
                id: storedMessage.id,
                seq: storedMessage.seq,
                localId: storedMessage.localId,
                content: storedMessage.content,
                createdAt: storedMessage.createdAt,
                invokedAt: storedMessage.invokedAt,
            },
        })
    })

    socket.on('stream-update', (data: unknown) => {
        const parsed = SessionStreamUpdatePayloadSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const update = parsed.data
        const sessionAccess = resolveSessionAccess(update.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', update.sid, sessionAccess.reason)
            return
        }

        const event =
            update.kind === 'append'
                ? sessionStreamManager.applyUpdate(update.sid, {
                      kind: 'append',
                      assistantTurnId: update.assistantTurnId,
                      delta: update.delta,
                  })
                : sessionStreamManager.applyUpdate(update.sid, {
                      kind: 'clear',
                      assistantTurnId: update.assistantTurnId,
                  })

        if (event) {
            onWebappEvent?.(event)
        }
    })

    const handleCommandCapabilitiesInvalidated: CommandCapabilitiesInvalidatedHandler = (data) => {
        const parsed = commandCapabilitiesInvalidatedSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const sessionAccess = resolveSessionAccess(parsed.data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', parsed.data.sid, sessionAccess.reason)
            return
        }

        onWebappEvent?.({
            type: 'command-capabilities-invalidated',
            sessionId: parsed.data.sid,
        })
    }

    socket.on('command-capabilities-invalidated', handleCommandCapabilitiesInvalidated)

    const handleMessagesConsumed: MessagesConsumedHandler = (data) => {
        const parsed = queuedMessageLocalIdsSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const localIds = parsed.data.localIds.filter((localId) => localId.length > 0)
        if (localIds.length === 0) {
            return
        }

        const sessionAccess = resolveSessionAccess(parsed.data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', parsed.data.sid, sessionAccess.reason)
            return
        }

        const invokedAt = Date.now()
        store.messages.markMessagesInvoked(parsed.data.sid, localIds, invokedAt)
        onWebappEvent?.({
            type: 'messages-consumed',
            sessionId: parsed.data.sid,
            localIds,
            invokedAt,
        })
    }

    const handleMessagesCanceled: MessagesCanceledHandler = (data) => {
        const parsed = queuedMessageLocalIdsSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const localIds = parsed.data.localIds.filter((localId) => localId.length > 0)
        if (localIds.length === 0) {
            return
        }

        const sessionAccess = resolveSessionAccess(parsed.data.sid)
        if (!sessionAccess.ok) {
            emitAccessError('session', parsed.data.sid, sessionAccess.reason)
            return
        }

        const canceledLocalIds = store.messages.cancelQueuedMessages(parsed.data.sid, localIds)
        if (canceledLocalIds.length === 0) {
            return
        }

        onWebappEvent?.({
            type: 'messages-canceled',
            sessionId: parsed.data.sid,
            localIds: canceledLocalIds,
        })
    }

    socket.on('messages-consumed', handleMessagesConsumed)
    socket.on('messages-canceled', handleMessagesCanceled)
}
