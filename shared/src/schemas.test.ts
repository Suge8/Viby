import { describe, expect, it } from 'vitest'
import { DecryptedMessageSchema, TodoItemSchema } from './schemas'

describe('TodoItemSchema', () => {
    it('accepts Claude TodoWrite items without optional Viby fields', () => {
        expect(
            TodoItemSchema.parse({
                content: 'Ship it',
                status: 'pending',
                activeForm: 'Shipping it',
            })
        ).toEqual({
            content: 'Ship it',
            status: 'pending',
            priority: 'medium',
            id: '',
            activeForm: 'Shipping it',
        })
    })
})

describe('DecryptedMessageSchema', () => {
    it('keeps invokedAt optional for legacy messages and explicit null for queued messages', () => {
        const baseMessage = {
            id: 'message-1',
            seq: 1,
            localId: 'local-1',
            content: {
                role: 'user',
                content: [{ type: 'text', text: 'queued' }],
            },
            createdAt: 1_000,
        }

        expect(DecryptedMessageSchema.parse(baseMessage).invokedAt).toBeUndefined()
        expect(DecryptedMessageSchema.parse({ ...baseMessage, invokedAt: null })).toMatchObject({
            localId: 'local-1',
            invokedAt: null,
        })
        expect(DecryptedMessageSchema.safeParse({ ...baseMessage, invokedAt: 'never' }).success).toBe(false)
    })
})
