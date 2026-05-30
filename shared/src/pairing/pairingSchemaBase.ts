import { z } from 'zod'
import {
    PairingDeviceProofSchema,
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingPwaHandoffTicketResponseSchema,
    PairingReconnectChallengeRequestSchema,
    PairingReconnectRequestSchema,
} from './pairingAuthSchema'
import { PairingCreateRequestSchema, PairingIceServerSchema } from './pairingCommonSchema'
import type {
    AuthorizedDeviceRecord,
    PairingParticipantRecord,
    PairingParticipantSnapshot,
    PairingRemoteConnectionSnapshot,
} from './pairingIdentitySchema'
import {
    AuthorizedDeviceRecordSchema,
    AuthorizedDeviceSnapshotSchema,
    PairingMetadataSchema,
    PairingParticipantRecordSchema,
    PairingParticipantSnapshotSchema,
    PairingRemoteConnectionSnapshotSchema,
} from './pairingIdentitySchema'
import { PairingTunnelDirectBlockedReasonSchema } from './pairingTunnelFrame'

export type {
    PairingDeviceProof,
    PairingDeviceReconnectChallengeRequest,
    PairingDeviceReconnectRequest,
    PairingPwaHandoffClaimRequest,
    PairingPwaHandoffTicketRequest,
    PairingPwaHandoffTicketResponse,
    PairingReconnectChallengeRequest,
    PairingReconnectRequest,
} from './pairingAuthSchema'
export {
    PairingDeviceProofSchema,
    PairingDeviceReconnectChallengeRequestSchema,
    PairingDeviceReconnectRequestSchema,
    PairingPwaHandoffClaimRequestSchema,
    PairingPwaHandoffTicketRequestSchema,
    PairingPwaHandoffTicketResponseSchema,
    PairingReconnectChallengeRequestSchema,
    PairingReconnectRequestSchema,
} from './pairingAuthSchema'
export type { PairingCreateRequest, PairingErrorPayload, PairingIceServer } from './pairingCommonSchema'
export { PairingCreateRequestSchema, PairingErrorPayloadSchema, PairingIceServerSchema } from './pairingCommonSchema'
export type {
    AuthorizedDeviceRecord,
    AuthorizedDeviceSnapshot,
    PairingMetadata,
    PairingParticipantRecord,
    PairingParticipantSnapshot,
    PairingRemoteConnectionSnapshot,
} from './pairingIdentitySchema'
export { PairingRemoteConnectionSnapshotSchema } from './pairingIdentitySchema'

export const PairingRoleSchema = z.enum(['host', 'guest'])
export type PairingRole = z.infer<typeof PairingRoleSchema>

export const PairingSessionStateSchema = z.enum(['active', 'waiting', 'deleted', 'expired'])
export type PairingSessionState = z.infer<typeof PairingSessionStateSchema>

export const PairingApprovalStatusSchema = z.literal('approved').nullable()
export type PairingApprovalStatus = z.infer<typeof PairingApprovalStatusSchema>

export const PairingSessionFieldsSchema = z.object({
    id: z.string().min(1),
    state: PairingSessionStateSchema,
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    shortCode: z
        .string()
        .regex(/^\d{6}$/)
        .nullable(),
    approvalStatus: PairingApprovalStatusSchema,
    metadata: PairingMetadataSchema.optional(),
})

export const PairingSessionSnapshotSchema = PairingSessionFieldsSchema.extend({
    host: PairingParticipantSnapshotSchema,
    authorizedDevice: AuthorizedDeviceSnapshotSchema.nullable(),
    guest: PairingParticipantSnapshotSchema.nullable(),
})
export type PairingSessionSnapshot = z.infer<typeof PairingSessionSnapshotSchema>

export const PairingSessionRecordSchema = PairingSessionFieldsSchema.extend({
    host: PairingParticipantRecordSchema,
    authorizedDevice: AuthorizedDeviceRecordSchema.nullable(),
})
export type PairingSessionRecord = z.infer<typeof PairingSessionRecordSchema>

/**
 * Single-step pairing auth: a guest device submits the 6-digit code shown on
 * the host's screen along with its own identity. The broker atomically
 * verifies the code, registers the guest, marks the session approved, and
 * returns the guest credentials needed to reach the relay/WebRTC plane.
 */
export const PairingVerifyCodeRequestSchema = z.object({
    code: z.string().regex(/^\d{6}$/),
    label: z.string().min(1).max(120).optional(),
    publicKey: z.string().min(1),
    metadata: PairingMetadataSchema.optional(),
})
export type PairingVerifyCodeRequest = z.infer<typeof PairingVerifyCodeRequestSchema>

export const PairingCreateResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    hostToken: z.string().min(1),
    pairingUrl: z.string().min(1),
    wsUrl: z.string().min(1),
    tunnelUrl: z.string().min(1),
    eventsUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingCreateResponse = z.infer<typeof PairingCreateResponseSchema>

/**
 * Shared response shape for any path that promotes a device to "approved
 * guest" status (initial verify-code, PWA handoff claim, reconnect). Carries
 * the guest token plus all transport endpoints the device needs.
 */
export const PairingGuestAuthResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    guestToken: z.string().min(1),
    wsUrl: z.string().min(1),
    tunnelUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingGuestAuthResponse = z.infer<typeof PairingGuestAuthResponseSchema>

export const PairingVerifyCodeResponseSchema = PairingGuestAuthResponseSchema
export type PairingVerifyCodeResponse = PairingGuestAuthResponse

/**
 * LAN pairing response shapes (hub-local). LAN devices connect directly to
 * the hub after verify and therefore do not need the WebRTC transport URLs
 * the broker returns; they receive a hub device token + reconnect secret.
 */
export const PairingLanCreateResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    pairingUrl: z.string().min(1),
    eventsUrl: z.string().min(1),
})
export type PairingLanCreateResponse = z.infer<typeof PairingLanCreateResponseSchema>

export const PairingLanVerifyCodeResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    deviceToken: z.string().min(1),
    deviceId: z.string().min(1),
    deviceSecret: z.string().min(1),
})
export type PairingLanVerifyCodeResponse = z.infer<typeof PairingLanVerifyCodeResponseSchema>

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
    tunnelUrl: z.string().min(1),
    iceServers: z.array(PairingIceServerSchema),
})
export type PairingReconnectResponse = z.infer<typeof PairingReconnectResponseSchema>

export const PairingDeleteResponseSchema = z.object({
    deleted: z.literal(true),
    pairing: PairingSessionSnapshotSchema,
})
export type PairingDeleteResponse = z.infer<typeof PairingDeleteResponseSchema>

export const PairingStatusResponseSchema = z.object({
    pairing: PairingSessionSnapshotSchema,
    remoteConnections: z.array(PairingRemoteConnectionSnapshotSchema),
})
export type PairingStatusResponse = z.infer<typeof PairingStatusResponseSchema>

/**
 * Host-side server-sent event payload. Hosts subscribe to
 * `GET /pairings/:id/events` to receive snapshot updates the moment a guest
 * verifies or the session is deleted, replacing client-side polling.
 */
export const PairingHostEventSchema = z.object({
    type: z.literal('pairing.updated'),
    pairing: PairingSessionSnapshotSchema,
    remoteConnections: z.array(PairingRemoteConnectionSnapshotSchema),
})
export type PairingHostEvent = z.infer<typeof PairingHostEventSchema>

export const PairingTelemetryTransportSchema = z.enum(['direct', 'relay', 'unknown'])
export type PairingTelemetryTransport = z.infer<typeof PairingTelemetryTransportSchema>
export const PairingTelemetryTransportModeSchema = z.enum(['direct-webrtc', 'relay-wss', 'unknown'])
export type PairingTelemetryTransportMode = z.infer<typeof PairingTelemetryTransportModeSchema>

export const PairingTelemetrySampleSchema = z.object({
    source: z.enum(['desktop', 'guest']),
    transport: PairingTelemetryTransportSchema,
    transportMode: PairingTelemetryTransportModeSchema,
    localCandidateType: z.string().min(1).nullable(),
    remoteCandidateType: z.string().min(1).nullable(),
    currentRoundTripTimeMs: z.number().int().nonnegative().nullable(),
    restartCount: z.number().int().nonnegative(),
    routeRevision: z.number().int().nonnegative(),
    directBlockedReason: PairingTunnelDirectBlockedReasonSchema.nullable().optional(),
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
        shortCode: session.shortCode,
        approvalStatus: session.approvalStatus,
        metadata: session.metadata,
        host: toPairingParticipantSnapshot(session.host),
        authorizedDevice: session.authorizedDevice,
        guest: session.authorizedDevice ? toGuestSnapshot(session.authorizedDevice) : null,
    }
}

export function toPairingSessionSnapshotForRole(
    session: PairingSessionRecord,
    role: PairingRole
): PairingSessionSnapshot {
    const snapshot = toPairingSessionSnapshot(session)
    if (role === 'guest' && snapshot.approvalStatus !== 'approved') {
        return { ...snapshot, shortCode: null }
    }

    return snapshot
}

export function toPairingParticipantSnapshot(participant: PairingParticipantRecord): PairingParticipantSnapshot {
    const { tokenHash: _tokenHash, ...publicParticipant } = participant
    return publicParticipant
}

export type PairingRemoteConnectionLike = {
    channel?: 'tunnel'
    connectedAt?: number
    connectionId?: string
    createdAt: number
    deviceId: string
    id: string
    lastSeenAt: number
}

export function toPairingRemoteConnectionSnapshot(
    connection: PairingRemoteConnectionLike
): PairingRemoteConnectionSnapshot {
    return {
        id: connection.id,
        connectionId: connection.connectionId ?? connection.id,
        deviceId: connection.deviceId,
        channel: connection.channel ?? 'tunnel',
        connectedAt: connection.connectedAt,
        createdAt: connection.createdAt,
        lastSeenAt: connection.lastSeenAt,
    }
}

function toGuestSnapshot(device: AuthorizedDeviceRecord): PairingParticipantSnapshot {
    return {
        label: device.label,
        publicKey: device.publicKey,
        lastSeenAt: device.lastSeenAt,
        metadata: device.metadata,
    }
}
