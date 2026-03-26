import {
    getSessionActivityKind,
    shouldMessageAdvanceSessionUpdatedAt
} from '@viby/protocol'
import type { AttachmentMetadata, DecryptedMessage, MessageMeta, SessionMessageActivity } from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import { EventPublisher } from './eventPublisher'

export class MessageService {
    constructor(
        private readonly store: Store,
        private readonly io: Server,
        private readonly publisher: EventPublisher
    ) {
    }

    getMessagesPage(sessionId: string, options: { limit: number; beforeSeq: number | null }): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        const stored = this.store.messages.getMessages(sessionId, options.limit, options.beforeSeq ?? undefined)
        const messages: DecryptedMessage[] = stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt
        }))

        let oldestSeq: number | null = null
        for (const message of messages) {
            if (typeof message.seq !== 'number') continue
            if (oldestSeq === null || message.seq < oldestSeq) {
                oldestSeq = message.seq
            }
        }

        const nextBeforeSeq = oldestSeq
        const hasMore = nextBeforeSeq !== null
            && this.store.messages.getMessages(sessionId, 1, nextBeforeSeq).length > 0

        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq,
                hasMore
            }
        }
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        const stored = this.store.messages.getMessagesAfter(sessionId, options.afterSeq, options.limit)
        return stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: message.content,
            createdAt: message.createdAt
        }))
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.store.messages.getSessionMessageActivities(sessionIds)
    }

    hasMessages(sessionId: string): boolean {
        return this.store.messages.getMessages(sessionId, 1).length > 0
    }

    async appendUserMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: AttachmentMetadata[]
            meta?: MessageMeta
        }
    ): Promise<void> {
        const content = {
            role: 'user',
            content: {
                type: 'text',
                text: payload.text,
                attachments: payload.attachments
            },
            ...(payload.meta ? { meta: payload.meta } : {})
        }
        await this.appendMessage(sessionId, content, payload.localId ?? undefined)
    }

    async sendMessage(
        sessionId: string,
        payload: {
            text: string
            localId?: string | null
            attachments?: AttachmentMetadata[]
            sentFrom?: 'webapp'
        }
    ): Promise<void> {
        await this.appendUserMessage(sessionId, {
            text: payload.text,
            localId: payload.localId,
            attachments: payload.attachments,
            meta: {
                sentFrom: payload.sentFrom ?? 'webapp'
            }
        })
    }

    private async appendMessage(sessionId: string, content: unknown, localId?: string): Promise<void> {
        const msg = this.store.messages.addMessage(sessionId, content, localId)
        const activityKind = getSessionActivityKind(msg.content)
        if (shouldMessageAdvanceSessionUpdatedAt(activityKind)) {
            this.store.sessions.touchSessionUpdatedAt(sessionId, msg.createdAt)
        }

        const update = {
            id: msg.id,
            seq: msg.seq,
            createdAt: msg.createdAt,
            body: {
                t: 'new-message' as const,
                sid: sessionId,
                message: {
                    id: msg.id,
                    seq: msg.seq,
                    createdAt: msg.createdAt,
                    localId: msg.localId,
                    content: msg.content
                }
            }
        }
        this.io.of('/cli').to(`session:${sessionId}`).emit('update', update)

        this.publisher.emit({
            type: 'message-received',
            sessionId,
            message: {
                id: msg.id,
                seq: msg.seq,
                localId: msg.localId,
                content: msg.content,
                createdAt: msg.createdAt
            }
        })
    }
}
