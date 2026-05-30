import { z } from 'zod'
import { PairingMetadataSchema } from './pairingIdentitySchema'

export const PairingIceServerSchema = z.object({
    urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    username: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
    credentialType: z.literal('password').optional(),
})
export type PairingIceServer = z.infer<typeof PairingIceServerSchema>

export const PairingCreateRequestSchema = z.object({
    label: z.string().min(1).max(120).optional(),
    metadata: PairingMetadataSchema.optional(),
    sessionTtlSeconds: z.number().int().positive().optional(),
})
export type PairingCreateRequest = z.infer<typeof PairingCreateRequestSchema>

export const PairingErrorPayloadSchema = z.object({
    code: z.string().min(1),
    message: z.string().min(1),
})
export type PairingErrorPayload = z.infer<typeof PairingErrorPayloadSchema>
