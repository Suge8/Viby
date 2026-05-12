import type { PairingDeviceProof, PairingRole } from '@viby/protocol/pairing'
import { verifyPairingDeviceProof } from './crypto'
import type { PairingStore } from './storeTypes'

export type PairingDeviceProofFailure = 'invalid' | 'challenge-expired'

export async function verifyStoredPairingDeviceProof(options: {
    challengeNonce?: string
    expectedPublicKey?: string
    now: number
    pairingId: string
    proof?: PairingDeviceProof
    role: PairingRole
    store: PairingStore
}): Promise<PairingDeviceProofFailure | null> {
    const challengeNonce = options.proof?.challengeNonce ?? options.challengeNonce
    if (!options.proof || !challengeNonce || options.proof.challengeNonce !== challengeNonce) {
        return 'invalid'
    }
    if (options.proof.publicKey !== options.expectedPublicKey) {
        return 'invalid'
    }

    const verified = await verifyPairingDeviceProof({
        pairingId: options.pairingId,
        challengeNonce,
        signedAt: options.proof.signedAt,
        publicKey: options.proof.publicKey,
        signature: options.proof.signature,
        now: options.now,
    })
    if (!verified) {
        return 'invalid'
    }

    const accepted = await options.store.consumeReconnectChallenge(
        options.pairingId,
        options.role,
        challengeNonce,
        options.now
    )
    return accepted ? null : 'challenge-expired'
}
