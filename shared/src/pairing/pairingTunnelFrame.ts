import { z } from 'zod'

export const PairingTunnelRouteSchema = z.enum(['relay', 'direct'])
export type PairingTunnelRoute = z.infer<typeof PairingTunnelRouteSchema>

export const PairingTunnelTransportSchema = z.enum(['relay-wss', 'direct-webrtc'])
export type PairingTunnelTransport = z.infer<typeof PairingTunnelTransportSchema>

export const PairingTunnelCandidateTypeSchema = z.enum(['host', 'srflx', 'prflx', 'relay'])
export type PairingTunnelCandidateType = z.infer<typeof PairingTunnelCandidateTypeSchema>

export const PairingTunnelTelemetrySchema = z.object({
    activeRoute: PairingTunnelRouteSchema.nullable(),
    activeTransport: PairingTunnelTransportSchema.nullable(),
    relayAvailable: z.boolean(),
    directProbe: z.enum(['idle', 'probing', 'usable', 'failed']),
    directCandidateType: PairingTunnelCandidateTypeSchema.nullable(),
    roundTripTimeMs: z.number().int().nonnegative().nullable(),
    missedAcks: z.number().int().nonnegative(),
    routeSwitches: z.number().int().nonnegative(),
    directProbeFailures: z.number().int().nonnegative(),
})
export type PairingTunnelTelemetry = z.infer<typeof PairingTunnelTelemetrySchema>

const PairingTunnelFrameBaseSchema = z.object({
    id: z.string().min(1),
    seq: z.number().int().nonnegative(),
})

export const PairingTunnelMessageFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('message'),
    payload: z.unknown(),
})
export type PairingTunnelMessageFrame = z.infer<typeof PairingTunnelMessageFrameSchema>

export const PairingTunnelBinaryFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('binary'),
    transferId: z.string().min(1),
    chunkIndex: z.number().int().nonnegative(),
    chunkCount: z.number().int().positive(),
    bytesBase64: z.string().min(1),
})
export type PairingTunnelBinaryFrame = z.infer<typeof PairingTunnelBinaryFrameSchema>

export const PairingTunnelHeartbeatFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('heartbeat'),
    route: PairingTunnelRouteSchema,
    sentAt: z.number().int().nonnegative(),
})
export type PairingTunnelHeartbeatFrame = z.infer<typeof PairingTunnelHeartbeatFrameSchema>

export const PairingTunnelHeartbeatAckFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('heartbeat-ack'),
    route: PairingTunnelRouteSchema,
    sentAt: z.number().int().nonnegative(),
    receivedAt: z.number().int().nonnegative(),
})
export type PairingTunnelHeartbeatAckFrame = z.infer<typeof PairingTunnelHeartbeatAckFrameSchema>

const PairingTunnelPlainFrameSchemas = [
    PairingTunnelMessageFrameSchema,
    PairingTunnelBinaryFrameSchema,
    PairingTunnelHeartbeatFrameSchema,
    PairingTunnelHeartbeatAckFrameSchema,
] as const

export const PairingTunnelPlainFrameSchema = z.discriminatedUnion('kind', PairingTunnelPlainFrameSchemas)
export type PairingTunnelPlainFrame = z.infer<typeof PairingTunnelPlainFrameSchema>

export const PairingTunnelKeyFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('key'),
    publicKey: z.string().min(1),
})
export type PairingTunnelKeyFrame = z.infer<typeof PairingTunnelKeyFrameSchema>

export const PairingTunnelSealedFrameSchema = PairingTunnelFrameBaseSchema.extend({
    kind: z.literal('sealed'),
    nonce: z.string().min(1),
    ciphertext: z.string().min(1),
})
export type PairingTunnelSealedFrame = z.infer<typeof PairingTunnelSealedFrameSchema>

export const PairingTunnelRelayFrameSchema = z.discriminatedUnion('kind', [
    PairingTunnelKeyFrameSchema,
    PairingTunnelSealedFrameSchema,
] as const)
export type PairingTunnelRelayFrame = z.infer<typeof PairingTunnelRelayFrameSchema>

export const PairingTunnelFrameSchema = z.discriminatedUnion('kind', [
    ...PairingTunnelPlainFrameSchemas,
    PairingTunnelKeyFrameSchema,
    PairingTunnelSealedFrameSchema,
] as const)
export type PairingTunnelFrame = z.infer<typeof PairingTunnelFrameSchema>
