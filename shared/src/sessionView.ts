import { z } from 'zod'
import { DecryptedMessageSchema, SessionSchema, SessionStreamStateSchema } from './schemas'
import { resolveSessionInteractivity } from './sessionLifecycle'
import { SESSION_TIMELINE_PAGE_SIZE } from './sessionRecovery'

export const PresentedSessionSchema = SessionSchema.extend({
    resumeAvailable: z.boolean(),
})

export type PresentedSession = z.infer<typeof PresentedSessionSchema>

export const SessionWindowPageSchema = z.object({
    limit: z.number().int().min(1).max(SESSION_TIMELINE_PAGE_SIZE),
    beforeSeq: z.number().int().nullable(),
    nextBeforeSeq: z.number().int().nullable(),
    hasMore: z.boolean(),
})

export type SessionWindowPage = z.infer<typeof SessionWindowPageSchema>

export const SessionViewInteractivitySchema = z.object({
    lifecycleState: z.enum(['running', 'open', 'closed', 'archived']),
    resumeAvailable: z.boolean(),
    allowSendWhenInactive: z.boolean(),
    retryAvailable: z.boolean(),
})

export type SessionViewInteractivity = z.infer<typeof SessionViewInteractivitySchema>

export const SessionViewWatermarkSchema = z.object({
    latestSeq: z.number().int().min(0),
    updatedAt: z.number(),
})

export type SessionViewWatermark = z.infer<typeof SessionViewWatermarkSchema>

export const SessionViewSnapshotSchema = z.object({
    session: PresentedSessionSchema,
    latestWindow: z.object({
        messages: z.array(DecryptedMessageSchema),
        page: SessionWindowPageSchema,
    }),
    stream: SessionStreamStateSchema.nullable(),
    watermark: SessionViewWatermarkSchema,
    interactivity: SessionViewInteractivitySchema,
})

export type SessionViewSnapshot = z.infer<typeof SessionViewSnapshotSchema>

export function presentSessionWithResumeAvailability<TSession extends z.infer<typeof SessionSchema>>(
    session: TSession
): TSession & { resumeAvailable: boolean } {
    return {
        ...session,
        resumeAvailable: resolveSessionInteractivity(session).resumeAvailable,
    }
}
