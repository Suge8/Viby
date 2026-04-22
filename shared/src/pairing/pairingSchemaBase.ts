import { z } from 'zod'

export const PairingRoleSchema = z.enum(['host', 'guest'])
export type PairingRole = z.infer<typeof PairingRoleSchema>

export const PairingSessionStateSchema = z.enum(['waiting', 'claimed', 'connected', 'deleted', 'expired'])
export type PairingSessionState = z.infer<typeof PairingSessionStateSchema>

export const PairingApprovalStatusSchema = z.enum(['pending', 'approved']).nullable()
export type PairingApprovalStatus = z.infer<typeof PairingApprovalStatusSchema>

export const PairingSignalTypeSchema = z.enum([
    'join',
    'offer',
    'answer',
    'candidate',
    'state',
    'ready',
    'peer-left',
    'expire',
    'ping',
    'pong',
    'error',
])
export type PairingSignalType = z.infer<typeof PairingSignalTypeSchema>

export const PairingMetadataSchema = z.record(z.string(), z.unknown())
export type PairingMetadata = z.infer<typeof PairingMetadataSchema>

export const PairingParticipantFieldsSchema = z.object({
    tokenHint: z.string().min(1).optional(),
    label: z.string().min(1).max(120).optional(),
    publicKey: z.string().min(1).optional(),
    connectedAt: z.number().int().nonnegative().optional(),
    lastSeenAt: z.number().int().nonnegative().optional(),
    metadata: PairingMetadataSchema.optional(),
})

export const PairingParticipantSnapshotSchema = PairingParticipantFieldsSchema
export type PairingParticipantSnapshot = z.infer<typeof PairingParticipantSnapshotSchema>

export const PairingParticipantRecordSchema = PairingParticipantFieldsSchema.extend({
    tokenHash: z.string().min(1),
})
export type PairingParticipantRecord = z.infer<typeof PairingParticipantRecordSchema>

export const PairingSessionFieldsSchema = z.object({
    id: z.string().min(1),
    state: PairingSessionStateSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    ticketExpiresAt: z.number().int().positive(),
    shortCode: z
        .string()
        .regex(/^\d{6}$/)
        .nullable(),
    approvalStatus: PairingApprovalStatusSchema,
    metadata: PairingMetadataSchema.optional(),
})

export const PairingSessionSnapshotSchema = PairingSessionFieldsSchema.extend({
    host: PairingParticipantSnapshotSchema,
    guest: PairingParticipantSnapshotSchema.nullable(),
})
export type PairingSessionSnapshot = z.infer<typeof PairingSessionSnapshotSchema>

export const PairingSessionRecordSchema = PairingSessionFieldsSchema.extend({
    ticketHash: z.string().min(1),
    host: PairingParticipantRecordSchema,
    guest: PairingParticipantRecordSchema.nullable(),
})
export type PairingSessionRecord = z.infer<typeof PairingSessionRecordSchema>

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
    ticketTtlSeconds: z.number().int().positive().optional(),
})
export type PairingCreateRequest = z.infer<typeof PairingCreateRequestSchema>

export const PairingClaimRequestSchema = z.object({
    ticket: z.string().min(1),
    label: z.string().min(1).max(120).optional(),
    publicKey: z.string().min(1).optional(),
    metadata: PairingMetadataSchema.optional(),
})
export type PairingClaimRequest = z.infer<typeof PairingClaimRequestSchema>

export const PairingSignalSchema = z.object({
    id: z.string().min(1).optional(),
    pairingId: z.string().min(1),
    type: PairingSignalTypeSchema,
    from: PairingRoleSchema.optional(),
    to: PairingRoleSchema.optional(),
    payload: z.unknown().optional(),
    reason: z.string().min(1).optional(),
    at: z.number().int().nonnegative().optional(),
})
export type PairingSignal = z.infer<typeof PairingSignalSchema>

export const PairingErrorPayloadSchema = z.object({
    code: z.string().min(1),
    message: z.string().min(1),
})
export type PairingErrorPayload = z.infer<typeof PairingErrorPayloadSchema>

export const PairingCreateResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    hostToken: z.string().min(1),
    pairingUrl: z.string().min(1),
    wsUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingCreateResponse = z.infer<typeof PairingCreateResponseSchema>

export const PairingClaimResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    guestToken: z.string().min(1),
    wsUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingClaimResponse = z.infer<typeof PairingClaimResponseSchema>

export const PairingReconnectRequestSchema = z.object({
    token: z.string().min(1),
    challengeNonce: z.string().min(1).optional(),
    deviceProof: z
        .object({
            publicKey: z.string().min(1),
            challengeNonce: z.string().min(1),
            signedAt: z.number().int().positive(),
            signature: z.string().min(1),
        })
        .optional(),
})
export type PairingReconnectRequest = z.infer<typeof PairingReconnectRequestSchema>

export const PairingReconnectChallengeRequestSchema = z.object({
    token: z.string().min(1),
})
export type PairingReconnectChallengeRequest = z.infer<typeof PairingReconnectChallengeRequestSchema>

export const PairingReconnectChallengeSchema = z.object({
    nonce: z.string().min(1),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
})
export type PairingReconnectChallenge = z.infer<typeof PairingReconnectChallengeSchema>

export const PairingReconnectChallengeResponseSchema = z.object({
    role: PairingRoleSchema,
    challenge: PairingReconnectChallengeSchema,
})
export type PairingReconnectChallengeResponse = z.infer<typeof PairingReconnectChallengeResponseSchema>

export const PairingReconnectResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    role: PairingRoleSchema,
    wsUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingReconnectResponse = z.infer<typeof PairingReconnectResponseSchema>

export const PairingDeleteResponseSchema = z.object({
    deleted: z.literal(true),
    pairing: PairingSessionSnapshotSchema,
})
export type PairingDeleteResponse = z.infer<typeof PairingDeleteResponseSchema>

export const PairingApproveResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
})
export type PairingApproveResponse = z.infer<typeof PairingApproveResponseSchema>

export const PairingTelemetryTransportSchema = z.enum(['direct', 'relay', 'unknown'])
export type PairingTelemetryTransport = z.infer<typeof PairingTelemetryTransportSchema>

export const PairingTelemetrySampleSchema = z.object({
    source: z.enum(['desktop', 'guest']),
    transport: PairingTelemetryTransportSchema,
    localCandidateType: z.string().min(1).nullable(),
    remoteCandidateType: z.string().min(1).nullable(),
    currentRoundTripTimeMs: z.number().int().nonnegative().nullable(),
    restartCount: z.number().int().nonnegative(),
    sampledAt: z.number().int().positive(),
})
export type PairingTelemetrySample = z.infer<typeof PairingTelemetrySampleSchema>

export const PairingTelemetryRequestSchema = z.object({
    sample: PairingTelemetrySampleSchema,
})
export type PairingTelemetryRequest = z.infer<typeof PairingTelemetryRequestSchema>

export const PairingTelemetryResponseSchema = z.object({
    accepted: z.literal(true),
})
export type PairingTelemetryResponse = z.infer<typeof PairingTelemetryResponseSchema>

export function toPairingSessionSnapshot(session: PairingSessionRecord): PairingSessionSnapshot {
    return {
        id: session.id,
        state: session.state,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        ticketExpiresAt: session.ticketExpiresAt,
        shortCode: session.shortCode,
        approvalStatus: session.approvalStatus,
        metadata: session.metadata,
        host: toPairingParticipantSnapshot(session.host),
        guest: session.guest ? toPairingParticipantSnapshot(session.guest) : null,
    }
}

export function toPairingParticipantSnapshot(participant: PairingParticipantRecord): PairingParticipantSnapshot {
    const { tokenHash: _tokenHash, ...publicParticipant } = participant
    return publicParticipant
}
