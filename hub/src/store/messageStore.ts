import type { Database } from 'bun:sqlite'
import { addMessage, addMessages, getMessages, getMessagesAfter, mergeSessionMessages } from './messages'
import type { StoredMessage } from './types'

export class MessageStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    addMessage(sessionId: string, content: unknown, localId?: string, createdAt?: number): StoredMessage {
        return addMessage(this.db, sessionId, content, localId, createdAt)
    }

    addMessages(
        sessionId: string,
        inputs: Array<{ content: unknown; localId?: string; createdAt?: number }>
    ): StoredMessage[] {
        return addMessages(this.db, sessionId, inputs)
    }

    getMessages(sessionId: string, limit: number = 200, beforeSeq?: number): StoredMessage[] {
        return getMessages(this.db, sessionId, limit, beforeSeq)
    }

    getMessagesAfter(sessionId: string, afterSeq: number, limit: number = 200): StoredMessage[] {
        return getMessagesAfter(this.db, sessionId, afterSeq, limit)
    }

    mergeSessionMessages(
        fromSessionId: string,
        toSessionId: string
    ): { moved: number; oldMaxSeq: number; newMaxSeq: number } {
        return mergeSessionMessages(this.db, fromSessionId, toSessionId)
    }
}
