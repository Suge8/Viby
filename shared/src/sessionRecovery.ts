import { z } from 'zod'

import { DecryptedMessageSchema, SessionSchema } from './schemas'

export const SESSION_TIMELINE_PAGE_SIZE = 50
export const SESSION_RECOVERY_PAGE_SIZE = 200
export const SESSION_MAX_MESSAGE_PAGE_SIZE = SESSION_RECOVERY_PAGE_SIZE

export const SessionRecoveryPageSchema = z.object({
    session: SessionSchema,
    messages: z.array(DecryptedMessageSchema),
    page: z.object({
        afterSeq: z.number().int().min(0),
        nextAfterSeq: z.number().int().min(0),
        limit: z.number().int().min(1).max(SESSION_MAX_MESSAGE_PAGE_SIZE),
        hasMore: z.boolean()
    })
})

export type SessionRecoveryPage = z.infer<typeof SessionRecoveryPageSchema>

export function findNextRecoveryCursor(
    messages: ReadonlyArray<{ seq: number | null }>,
    cursor: number
): number {
    let nextCursor = cursor
    for (const message of messages) {
        if (typeof message.seq === 'number' && message.seq > nextCursor) {
            nextCursor = message.seq
        }
    }
    return nextCursor
}
