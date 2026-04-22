import { isObject, type SessionDriver, sanitizeDurableAttachmentMetadataList } from '@viby/protocol'
import type { AttachmentMetadata, DecryptedMessage, MessageMeta, SessionMessageActivity } from '@viby/protocol/types'
import type { Server } from 'socket.io'
import type { Store } from '../store'
import { EventPublisher } from './eventPublisher'

type DriverSwitchedEvent = {
    type: 'driver-switched'
    previousDriver: SessionDriver
    targetDriver: SessionDriver
}

function createDriverSwitchedMessageContent(event: DriverSwitchedEvent): {
    role: 'agent'
    content: {
        type: 'event'
        data: DriverSwitchedEvent
    }
} {
    return {
        role: 'agent',
        content: {
            type: 'event',
            data: event,
        },
    }
}

export class MessageService {
    constructor(
        private readonly store: Store,
        private readonly io: Server,
        private readonly publisher: EventPublisher
    ) {}

    getMessagesPage(
        sessionId: string,
        options: { limit: number; beforeSeq: number | null }
    ): {
        messages: DecryptedMessage[]
        page: {
            limit: number
            beforeSeq: number | null
            nextBeforeSeq: number | null
            hasMore: boolean
        }
    } {
        const stored = this.store.messages.getMessages(sessionId, options.limit + 1, options.beforeSeq ?? undefined)
        const hasMore = stored.length > options.limit
        const visibleMessages = hasMore ? stored.slice(-options.limit) : stored
        const messages: DecryptedMessage[] = visibleMessages.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: sanitizeDurableMessageContent(message.content),
            createdAt: message.createdAt,
        }))

        let oldestSeq: number | null = null
        for (const message of messages) {
            if (typeof message.seq !== 'number') continue
            if (oldestSeq === null || message.seq < oldestSeq) {
                oldestSeq = message.seq
            }
        }

        return {
            messages,
            page: {
                limit: options.limit,
                beforeSeq: options.beforeSeq,
                nextBeforeSeq: oldestSeq,
                hasMore,
            },
        }
    }

    getMessagesAfter(sessionId: string, options: { afterSeq: number; limit: number }): DecryptedMessage[] {
        const stored = this.store.messages.getMessagesAfter(sessionId, options.afterSeq, options.limit)
        return stored.map((message) => ({
            id: message.id,
            seq: message.seq,
            localId: message.localId,
            content: sanitizeDurableMessageContent(message.content),
            createdAt: message.createdAt,
        }))
    }

    getSessionMessageActivities(sessionIds: string[]): Record<string, SessionMessageActivity> {
        return this.store.sessions.getSessionMessageActivities(sessionIds)
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
        const attachments = sanitizeDurableAttachmentMetadataList(payload.attachments)
        const content = {
            role: 'user',
            content: {
                type: 'text',
                text: payload.text,
                attachments,
            },
            ...(payload.meta ? { meta: payload.meta } : {}),
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
                sentFrom: payload.sentFrom ?? 'webapp',
            },
        })
    }

    async appendDriverSwitchedEvent(sessionId: string, event: DriverSwitchedEvent): Promise<void> {
        await this.appendMessage(sessionId, createDriverSwitchedMessageContent(event))
    }

    private async appendMessage(sessionId: string, content: unknown, localId?: string): Promise<void> {
        const msg = this.store.messages.addMessage(sessionId, content, localId)

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
                    content: msg.content,
                },
            },
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
                createdAt: msg.createdAt,
            },
        })
    }
}

function sanitizeDurableMessageContent(content: unknown): unknown {
    if (
        !isObject(content) ||
        content.role !== 'user' ||
        !isObject(content.content) ||
        content.content.type !== 'text'
    ) {
        return content
    }

    const rawAttachments = content.content.attachments
    if (!Array.isArray(rawAttachments)) {
        return content
    }

    let changed = false
    const nextAttachments = rawAttachments.map((attachment) => {
        if (
            !isObject(attachment) ||
            typeof attachment.id !== 'string' ||
            typeof attachment.filename !== 'string' ||
            typeof attachment.mimeType !== 'string' ||
            typeof attachment.size !== 'number' ||
            typeof attachment.path !== 'string'
        ) {
            return attachment
        }

        const sanitized =
            sanitizeDurableAttachmentMetadataList([
                {
                    id: attachment.id,
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    size: attachment.size,
                    path: attachment.path,
                    previewUrl: typeof attachment.previewUrl === 'string' ? attachment.previewUrl : undefined,
                },
            ])?.[0] ?? attachment

        if (sanitized.previewUrl !== (typeof attachment.previewUrl === 'string' ? attachment.previewUrl : undefined)) {
            changed = true
        }

        return sanitized
    })

    if (!changed) {
        return content
    }

    return {
        ...content,
        content: {
            ...content.content,
            attachments: nextAttachments,
        },
    }
}
