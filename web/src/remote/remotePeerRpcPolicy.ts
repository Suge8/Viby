import type { PairingPeerRequest } from '@viby/protocol'
import type { PairingPeerTextPriority } from '@viby/protocol/pairing'

const INTERACTIVE_METHODS = new Set<PairingPeerRequest['method']>([
    'sessions.list',
    'session.messages',
    'session.load-after',
])

export function getRemotePeerRequestPriority(method: PairingPeerRequest['method']): PairingPeerTextPriority {
    return INTERACTIVE_METHODS.has(method) ? 'interactive' : 'urgent'
}
