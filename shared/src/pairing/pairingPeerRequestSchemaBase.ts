import { z } from 'zod'

export const PairingPeerRequestIdSchema = z.string().min(1)

export function createPairingPeerRequestSchema<const TMethod extends string, TParams extends z.ZodType>(
    method: TMethod,
    params: TParams
): z.ZodObject<{
    kind: z.ZodLiteral<'request'>
    id: typeof PairingPeerRequestIdSchema
    method: z.ZodLiteral<TMethod>
    params: TParams
}> {
    return z.object({ kind: z.literal('request'), id: PairingPeerRequestIdSchema, method: z.literal(method), params })
}

export function createOptionalPairingPeerRequestSchema<const TMethod extends string, TParams extends z.ZodType>(
    method: TMethod,
    params: TParams
): z.ZodObject<{
    kind: z.ZodLiteral<'request'>
    id: typeof PairingPeerRequestIdSchema
    method: z.ZodLiteral<TMethod>
    params: z.ZodOptional<TParams>
}> {
    return z.object({
        kind: z.literal('request'),
        id: PairingPeerRequestIdSchema,
        method: z.literal(method),
        params: params.optional(),
    })
}
