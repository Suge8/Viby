import { z } from 'zod'
import { SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '../attachmentUpload'
import {
    TerminalClosePayloadSchema,
    TerminalErrorPayloadSchema,
    TerminalExitPayloadSchema,
    TerminalOpenPayloadSchema,
    TerminalOutputPayloadSchema,
    TerminalReadyPayloadSchema,
    TerminalResizePayloadSchema,
    TerminalWritePayloadSchema,
} from '../socket'
import { createOptionalPairingPeerRequestSchema, createPairingPeerRequestSchema } from './pairingPeerRequestSchemaBase'

export const PairingPeerUploadStartParamsSchema = z.object({
    sessionId: z.string().min(1),
    transferId: z.string().uuid(),
    filename: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.number().int().nonnegative().max(SESSION_ATTACHMENT_MAX_UPLOAD_BYTES),
})
export type PairingPeerUploadStartParams = z.infer<typeof PairingPeerUploadStartParamsSchema>

export const PairingPeerUploadCompleteParamsSchema = z.object({
    sessionId: z.string().min(1),
    transferId: z.string().uuid(),
})
export type PairingPeerUploadCompleteParams = z.infer<typeof PairingPeerUploadCompleteParamsSchema>

export const PairingPeerUploadCancelParamsSchema = z.object({ transferId: z.string().uuid() })
export type PairingPeerUploadCancelParams = z.infer<typeof PairingPeerUploadCancelParamsSchema>

export const PairingPeerUploadResultSchema = z.object({
    success: z.boolean(),
    path: z.string().optional(),
    error: z.string().optional(),
})
export type PairingPeerUploadResult = z.infer<typeof PairingPeerUploadResultSchema>

export const PairingPeerTerminalOpenRequestSchema = createPairingPeerRequestSchema(
    'terminal.open',
    TerminalOpenPayloadSchema
)
export const PairingPeerTerminalWriteRequestSchema = createPairingPeerRequestSchema(
    'terminal.write',
    TerminalWritePayloadSchema
)
export const PairingPeerTerminalResizeRequestSchema = createPairingPeerRequestSchema(
    'terminal.resize',
    TerminalResizePayloadSchema
)
export const PairingPeerTerminalCloseRequestSchema = createPairingPeerRequestSchema(
    'terminal.close',
    TerminalClosePayloadSchema
)

export const PairingPeerUploadStartRequestSchema = createPairingPeerRequestSchema(
    'session.upload-start',
    PairingPeerUploadStartParamsSchema
)
export const PairingPeerUploadCompleteRequestSchema = createPairingPeerRequestSchema(
    'session.upload-complete',
    PairingPeerUploadCompleteParamsSchema
)
export const PairingPeerUploadCancelRequestSchema = createPairingPeerRequestSchema(
    'session.upload-cancel',
    PairingPeerUploadCancelParamsSchema
)

export const PairingPeerPushSubscriptionParamsSchema = z.object({
    endpoint: z.string().min(1),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})
export type PairingPeerPushSubscriptionParams = z.infer<typeof PairingPeerPushSubscriptionParamsSchema>

export const PairingPeerPushUnsubscribeParamsSchema = z.object({ endpoint: z.string().min(1) })
export type PairingPeerPushUnsubscribeParams = z.infer<typeof PairingPeerPushUnsubscribeParamsSchema>

export const PairingPeerPushVapidResultSchema = z.object({ publicKey: z.string() })
export type PairingPeerPushVapidResult = z.infer<typeof PairingPeerPushVapidResultSchema>

export const PairingPeerPushVapidRequestSchema = createOptionalPairingPeerRequestSchema(
    'push.vapid-public-key',
    z.object({})
)
export const PairingPeerPushSubscribeRequestSchema = createPairingPeerRequestSchema(
    'push.subscribe',
    PairingPeerPushSubscriptionParamsSchema
)
export const PairingPeerPushUnsubscribeRequestSchema = createPairingPeerRequestSchema(
    'push.unsubscribe',
    PairingPeerPushUnsubscribeParamsSchema
)

export const PairingPeerTerminalEventPayloadSchema = z.discriminatedUnion('type', [
    TerminalReadyPayloadSchema.extend({ type: z.literal('ready') }),
    TerminalOutputPayloadSchema.extend({ type: z.literal('output') }),
    TerminalExitPayloadSchema.extend({ type: z.literal('exit') }),
    TerminalErrorPayloadSchema.extend({ type: z.literal('error') }),
])
export type PairingPeerTerminalEventPayload = z.infer<typeof PairingPeerTerminalEventPayloadSchema>
