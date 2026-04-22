import { z } from 'zod'
import { DecryptedMessageSchema, SessionDriverSchema, SessionSchema, SyncEventSchema } from '../schemas'
import { SessionViewSnapshotSchema } from '../sessionView'
import { PairingErrorPayloadSchema } from './pairingSchemaBase'

export const PairingPeerMethodSchema = z.enum([
    'sessions.list',
    'session.open',
    'session.resume',
    'session.load-after',
    'session.send',
])
export type PairingPeerMethod = z.infer<typeof PairingPeerMethodSchema>

export const PairingRemoteSessionSummarySchema = z.object({
    id: z.string().min(1),
    active: z.boolean(),
    thinking: z.boolean(),
    updatedAt: z.number().int().nonnegative(),
    latestActivityAt: z.number().int().nonnegative().nullable(),
    lifecycleState: z.enum(['running', 'open', 'closed', 'archived']),
    resumeAvailable: z.boolean(),
    model: z.string().nullable(),
    metadata: z
        .object({
            name: z.string().min(1).optional(),
            path: z.string().min(1),
            driver: SessionDriverSchema.nullish().optional(),
            summary: z
                .object({
                    text: z.string().min(1),
                    updatedAt: z.number().int().nonnegative(),
                })
                .optional(),
        })
        .nullable(),
})
export type PairingRemoteSessionSummary = z.infer<typeof PairingRemoteSessionSummarySchema>

export const PairingPeerListSessionsParamsSchema = z.object({})
export type PairingPeerListSessionsParams = z.infer<typeof PairingPeerListSessionsParamsSchema>

export const PairingPeerOpenSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
})
export type PairingPeerOpenSessionParams = z.infer<typeof PairingPeerOpenSessionParamsSchema>

export const PairingPeerResumeSessionParamsSchema = z.object({
    sessionId: z.string().min(1),
})
export type PairingPeerResumeSessionParams = z.infer<typeof PairingPeerResumeSessionParamsSchema>

export const PairingPeerLoadAfterParamsSchema = z.object({
    sessionId: z.string().min(1),
    afterSeq: z.number().int().min(0),
    limit: z.number().int().positive().max(200).optional(),
})
export type PairingPeerLoadAfterParams = z.infer<typeof PairingPeerLoadAfterParamsSchema>

export const PairingPeerSendMessageParamsSchema = z.object({
    sessionId: z.string().min(1),
    text: z.string(),
    localId: z.string().min(1).optional(),
})
export type PairingPeerSendMessageParams = z.infer<typeof PairingPeerSendMessageParamsSchema>

export const PairingPeerListSessionsResultSchema = z.object({
    sessions: z.array(PairingRemoteSessionSummarySchema),
})
export type PairingPeerListSessionsResult = z.infer<typeof PairingPeerListSessionsResultSchema>

export const PairingPeerOpenSessionResultSchema = SessionViewSnapshotSchema
export type PairingPeerOpenSessionResult = z.infer<typeof PairingPeerOpenSessionResultSchema>

export const PairingPeerResumeSessionResultSchema = SessionViewSnapshotSchema
export type PairingPeerResumeSessionResult = z.infer<typeof PairingPeerResumeSessionResultSchema>

export const PairingPeerLoadAfterResultSchema = z.object({
    messages: z.array(DecryptedMessageSchema),
    nextAfterSeq: z.number().int().min(0),
})
export type PairingPeerLoadAfterResult = z.infer<typeof PairingPeerLoadAfterResultSchema>

export const PairingPeerSendMessageResultSchema = z.object({
    session: SessionSchema,
})
export type PairingPeerSendMessageResult = z.infer<typeof PairingPeerSendMessageResultSchema>

export const PairingPeerRequestIdSchema = z.string().min(1)

export const PairingPeerListSessionsRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('sessions.list'),
    params: PairingPeerListSessionsParamsSchema.optional(),
})

export const PairingPeerOpenSessionRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('session.open'),
    params: PairingPeerOpenSessionParamsSchema,
})

export const PairingPeerResumeSessionRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('session.resume'),
    params: PairingPeerResumeSessionParamsSchema,
})

export const PairingPeerLoadAfterRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('session.load-after'),
    params: PairingPeerLoadAfterParamsSchema,
})

export const PairingPeerSendMessageRequestSchema = z.object({
    kind: z.literal('request'),
    id: PairingPeerRequestIdSchema,
    method: z.literal('session.send'),
    params: PairingPeerSendMessageParamsSchema,
})

export const PairingPeerRequestSchema = z.discriminatedUnion('method', [
    PairingPeerListSessionsRequestSchema,
    PairingPeerOpenSessionRequestSchema,
    PairingPeerResumeSessionRequestSchema,
    PairingPeerLoadAfterRequestSchema,
    PairingPeerSendMessageRequestSchema,
])
export type PairingPeerRequest = z.infer<typeof PairingPeerRequestSchema>

export const PairingPeerResponseSuccessSchema = z.object({
    kind: z.literal('response'),
    id: PairingPeerRequestIdSchema,
    ok: z.literal(true),
    result: z.unknown(),
})

export const PairingPeerResponseErrorSchema = z.object({
    kind: z.literal('response'),
    id: PairingPeerRequestIdSchema,
    ok: z.literal(false),
    error: PairingErrorPayloadSchema,
})

export const PairingPeerResponseSchema = z.discriminatedUnion('ok', [
    PairingPeerResponseSuccessSchema,
    PairingPeerResponseErrorSchema,
])
export type PairingPeerResponse = z.infer<typeof PairingPeerResponseSchema>

export const PairingPeerEventSchema = z.object({
    kind: z.literal('event'),
    event: z.literal('sync-event'),
    payload: SyncEventSchema,
})
export type PairingPeerEvent = z.infer<typeof PairingPeerEventSchema>

export const PairingPeerMessageSchema = z.discriminatedUnion('kind', [
    PairingPeerRequestSchema,
    PairingPeerResponseSchema,
    PairingPeerEventSchema,
])
export type PairingPeerMessage = z.infer<typeof PairingPeerMessageSchema>
