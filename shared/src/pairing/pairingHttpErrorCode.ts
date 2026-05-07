import { z } from 'zod'

export const PairingHttpErrorCodeSchema = z.enum([
    'pairing_invalid_token',
    'pairing_unavailable',
    'pairing_invalid_device_proof',
    'pairing_reconnect_challenge_expired',
    'pairing_rate_limited',
])
export type PairingHttpErrorCode = z.infer<typeof PairingHttpErrorCodeSchema>

export const PAIRING_HTTP_ERROR_MESSAGES: Record<PairingHttpErrorCode, string> = {
    pairing_invalid_token: 'Invalid pairing token',
    pairing_unavailable: 'Pairing session no longer active',
    pairing_invalid_device_proof: 'Device proof verification failed',
    pairing_reconnect_challenge_expired: 'Missing or expired reconnect challenge',
    pairing_rate_limited: 'Too many pairing requests. Please retry shortly.',
}
