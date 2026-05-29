import { z } from 'zod'
import { PairingRtcSignalSchema } from './pairingSignal'
import { PairingTunnelRelayFrameSchema } from './pairingTunnelFrame'

export const PairingBrokerSignalMessageSchema = PairingRtcSignalSchema
export type PairingBrokerSignalMessage = z.infer<typeof PairingBrokerSignalMessageSchema>

export const PairingBrokerTunnelMessageSchema = PairingTunnelRelayFrameSchema
export type PairingBrokerTunnelMessage = z.infer<typeof PairingBrokerTunnelMessageSchema>

export const PairingBrokerSocketMessageSchema = z.union([
    PairingBrokerSignalMessageSchema,
    PairingBrokerTunnelMessageSchema,
])
export type PairingBrokerSocketMessage = z.infer<typeof PairingBrokerSocketMessageSchema>
