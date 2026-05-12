import { z } from 'zod'

export const PairingByeReasonSchema = z.enum([
    'pairing_unavailable',
    'invalid_token',
    'invalid_device_proof',
    'handoff_invalid',
    'user_revoked',
])
export type PairingByeReason = z.infer<typeof PairingByeReasonSchema>

export const RtcSessionDescriptionSchema = z.object({
    type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
    sdp: z.string().optional(),
})
export type RtcSessionDescription = z.infer<typeof RtcSessionDescriptionSchema>

export const RtcIceCandidateSchema = z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable().optional(),
    sdpMLineIndex: z.number().nullable().optional(),
    usernameFragment: z.string().nullable().optional(),
})
export type RtcIceCandidate = z.infer<typeof RtcIceCandidateSchema>

export const PairingSignalV2DescriptionSchema = z.object({
    type: z.literal('description'),
    description: RtcSessionDescriptionSchema,
})
export type PairingSignalV2Description = z.infer<typeof PairingSignalV2DescriptionSchema>

export const PairingSignalV2CandidateSchema = z.object({
    type: z.literal('candidate'),
    candidate: RtcIceCandidateSchema,
})
export type PairingSignalV2Candidate = z.infer<typeof PairingSignalV2CandidateSchema>

export const PairingSignalV2ByeSchema = z.object({
    type: z.literal('bye'),
    reason: PairingByeReasonSchema,
})
export type PairingSignalV2Bye = z.infer<typeof PairingSignalV2ByeSchema>

export const PairingSignalV2Schema = z.discriminatedUnion('type', [
    PairingSignalV2DescriptionSchema,
    PairingSignalV2CandidateSchema,
    PairingSignalV2ByeSchema,
])
export type PairingSignalV2 = z.infer<typeof PairingSignalV2Schema>
