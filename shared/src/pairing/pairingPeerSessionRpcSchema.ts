import { z } from 'zod'
import { CodexServiceTierSchema, DecryptedMessageSchema, SessionDriverSchema } from '../schemas'
import { SESSION_TIMELINE_PAGE_SIZE } from '../sessionRecovery'
import { SessionViewSnapshotSchema, SessionWindowPageSchema } from '../sessionView'
import { createOptionalPairingPeerRequestSchema, createPairingPeerRequestSchema } from './pairingPeerRequestSchemaBase'

export const PairingRemoteSessionSummarySchema = z.object({
    id: z.string().min(1),
    active: z.boolean(),
    thinking: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
    latestActivityAt: z.number().int().nonnegative().nullable(),
    lifecycleState: z.enum(['running', 'open', 'closed', 'archived']),
    resumeAvailable: z.boolean(),
    model: z.string().nullable(),
    codexServiceTier: CodexServiceTierSchema.nullable(),
    metadata: z
        .object({
            name: z.string().min(1).optional(),
            path: z.string().min(1),
            driver: SessionDriverSchema.nullish().optional(),
            summary: z.object({ text: z.string().min(1), updatedAt: z.number().int().nonnegative() }).optional(),
        })
        .nullable(),
})
export type PairingRemoteSessionSummary = z.infer<typeof PairingRemoteSessionSummarySchema>

export const PairingPeerListSessionsParamsSchema = z.object({})
export type PairingPeerListSessionsParams = z.infer<typeof PairingPeerListSessionsParamsSchema>
export const PairingPeerOpenSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
    includeLatestWindow: z.boolean().optional(),
})
export type PairingPeerOpenSessionParams = z.infer<typeof PairingPeerOpenSessionParamsSchema>
export const PairingPeerResumeSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
    includeLatestWindow: z.boolean().optional(),
})
export type PairingPeerResumeSessionParams = z.infer<typeof PairingPeerResumeSessionParamsSchema>
export const PairingPeerLoadAfterParamsSchema = z.object({
    sessionId: z.string().min(1),
    afterSeq: z.number().int().min(0),
    limit: z.number().int().positive().max(200).optional(),
})
export type PairingPeerLoadAfterParams = z.infer<typeof PairingPeerLoadAfterParamsSchema>
export const PairingPeerMessagesParamsSchema = z
    .object({
        sessionId: z.string().min(1),
        beforeSeq: z.number().int().min(1).nullable().optional(),
        afterSeq: z.number().int().min(0).optional(),
        limit: z.number().int().positive().max(SESSION_TIMELINE_PAGE_SIZE).optional(),
    })
    .refine((value) => !(value.beforeSeq !== undefined && value.beforeSeq !== null && value.afterSeq !== undefined), {
        message: 'beforeSeq and afterSeq cannot be used together',
    })
export type PairingPeerMessagesParams = z.infer<typeof PairingPeerMessagesParamsSchema>

export const PairingPeerListSessionsResultSchema = z.object({ sessions: z.array(PairingRemoteSessionSummarySchema) })
export type PairingPeerListSessionsResult = z.infer<typeof PairingPeerListSessionsResultSchema>
export const PairingPeerSessionHeadResultSchema = SessionViewSnapshotSchema.omit({ latestWindow: true })
export type PairingPeerSessionHeadResult = z.infer<typeof PairingPeerSessionHeadResultSchema>
export const PairingPeerSessionViewOrHeadResultSchema = z.union([
    SessionViewSnapshotSchema,
    PairingPeerSessionHeadResultSchema,
])
export const PairingPeerOpenSessionResultSchema = PairingPeerSessionViewOrHeadResultSchema
export type PairingPeerOpenSessionResult = z.infer<typeof PairingPeerOpenSessionResultSchema>
export const PairingPeerResumeSessionResultSchema = PairingPeerSessionViewOrHeadResultSchema
export type PairingPeerResumeSessionResult = z.infer<typeof PairingPeerResumeSessionResultSchema>
export const PairingPeerLoadAfterResultSchema = z.object({
    messages: z.array(DecryptedMessageSchema),
    nextAfterSeq: z.number().int().min(0),
})
export type PairingPeerLoadAfterResult = z.infer<typeof PairingPeerLoadAfterResultSchema>
export const PairingPeerMessagesResultSchema = z.object({
    messages: z.array(DecryptedMessageSchema),
    page: SessionWindowPageSchema,
})
export type PairingPeerMessagesResult = z.infer<typeof PairingPeerMessagesResultSchema>

export const PairingPeerListSessionsRequestSchema = createOptionalPairingPeerRequestSchema(
    'sessions.list',
    PairingPeerListSessionsParamsSchema
)
export const PairingPeerOpenSessionRequestSchema = createPairingPeerRequestSchema(
    'session.open',
    PairingPeerOpenSessionParamsSchema
)
export const PairingPeerResumeSessionRequestSchema = createPairingPeerRequestSchema(
    'session.resume',
    PairingPeerResumeSessionParamsSchema
)
export const PairingPeerLoadAfterRequestSchema = createPairingPeerRequestSchema(
    'session.load-after',
    PairingPeerLoadAfterParamsSchema
)
export const PairingPeerMessagesRequestSchema = createPairingPeerRequestSchema(
    'session.messages',
    PairingPeerMessagesParamsSchema
)
