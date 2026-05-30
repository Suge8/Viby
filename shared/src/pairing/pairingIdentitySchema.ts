import { z } from 'zod'

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

export const AuthorizedDeviceRecordSchema = z.object({
    id: z.string().min(1),
    publicKey: z.string().min(1),
    label: z.string().min(1).max(120).optional(),
    metadata: PairingMetadataSchema.optional(),
    authorizedAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
})
export type AuthorizedDeviceRecord = z.infer<typeof AuthorizedDeviceRecordSchema>

export const AuthorizedDeviceSnapshotSchema = AuthorizedDeviceRecordSchema
export type AuthorizedDeviceSnapshot = z.infer<typeof AuthorizedDeviceSnapshotSchema>

export const PairingRemoteConnectionSnapshotSchema = z.object({
    id: z.string().min(1),
    connectionId: z.string().min(1),
    deviceId: z.string().min(1),
    channel: z.literal('tunnel'),
    connectedAt: z.number().int().nonnegative().optional(),
    createdAt: z.number().int().nonnegative(),
    lastSeenAt: z.number().int().nonnegative(),
})
export type PairingRemoteConnectionSnapshot = z.infer<typeof PairingRemoteConnectionSnapshotSchema>
