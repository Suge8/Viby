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

export const PairingRtcDescriptionSignalSchema = z.object({
    type: z.literal('description'),
    description: RtcSessionDescriptionSchema,
})
export type PairingRtcDescriptionSignal = z.infer<typeof PairingRtcDescriptionSignalSchema>

export const PairingRtcCandidateSignalSchema = z.object({
    type: z.literal('candidate'),
    candidate: RtcIceCandidateSchema,
})
export type PairingRtcCandidateSignal = z.infer<typeof PairingRtcCandidateSignalSchema>

export const PairingRtcByeSignalSchema = z.object({
    type: z.literal('bye'),
    reason: PairingByeReasonSchema,
})
export type PairingRtcByeSignal = z.infer<typeof PairingRtcByeSignalSchema>

export const PairingRtcSignalSchema = z.discriminatedUnion('type', [
    PairingRtcDescriptionSignalSchema,
    PairingRtcCandidateSignalSchema,
    PairingRtcByeSignalSchema,
])
export type PairingRtcSignal = z.infer<typeof PairingRtcSignalSchema>

export const PairingBrokerControlSignalSchema = z.object({ type: z.literal('peer-replaced') })
export type PairingBrokerControlSignal = z.infer<typeof PairingBrokerControlSignalSchema>

export const PairingTransportSignalSchema = z.discriminatedUnion('type', [
    PairingRtcDescriptionSignalSchema,
    PairingRtcCandidateSignalSchema,
    PairingRtcByeSignalSchema,
    PairingBrokerControlSignalSchema,
])
export type PairingTransportSignal = z.infer<typeof PairingTransportSignalSchema>
