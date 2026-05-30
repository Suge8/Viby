import { z } from 'zod'

export const PairingDeviceProofSchema = z.object({
    publicKey: z.string().min(1),
    challengeNonce: z.string().min(1),
    signedAt: z.number().int().positive(),
    signature: z.string().min(1),
})
export type PairingDeviceProof = z.infer<typeof PairingDeviceProofSchema>

export const PairingReconnectRequestSchema = z.object({
    token: z.string().min(1),
    challengeNonce: z.string().min(1).optional(),
    deviceProof: PairingDeviceProofSchema.optional(),
})
export type PairingReconnectRequest = z.infer<typeof PairingReconnectRequestSchema>

export const PairingReconnectChallengeRequestSchema = z.object({
    token: z.string().min(1),
})
export type PairingReconnectChallengeRequest = z.infer<typeof PairingReconnectChallengeRequestSchema>

export const PairingDeviceReconnectChallengeRequestSchema = z.object({
    publicKey: z.string().min(1),
})
export type PairingDeviceReconnectChallengeRequest = z.infer<typeof PairingDeviceReconnectChallengeRequestSchema>

export const PairingDeviceReconnectRequestSchema = z.object({
    deviceProof: PairingDeviceProofSchema,
})
export type PairingDeviceReconnectRequest = z.infer<typeof PairingDeviceReconnectRequestSchema>

export const PairingPwaHandoffTicketRequestSchema = z.object({
    token: z.string().min(1),
    deviceProof: PairingDeviceProofSchema,
})
export type PairingPwaHandoffTicketRequest = z.infer<typeof PairingPwaHandoffTicketRequestSchema>

export const PairingPwaHandoffTicketResponseSchema = z.object({
    handoffTicket: z.string().min(1),
    expiresAt: z.number().int().positive(),
})
export type PairingPwaHandoffTicketResponse = z.infer<typeof PairingPwaHandoffTicketResponseSchema>

export const PairingPwaHandoffClaimRequestSchema = z.object({
    handoffTicket: z.string().min(1),
    label: z.string().optional(),
    publicKey: z.string().min(1),
})
export type PairingPwaHandoffClaimRequest = z.infer<typeof PairingPwaHandoffClaimRequestSchema>
