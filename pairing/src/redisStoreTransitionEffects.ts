import type { PairingSessionTransition } from './pairingSessionTransition'
import {
    clearGuestConnectionTokenIndexes,
    clearHandoffTicket,
    clearReconnectChallenges,
    saveRemoteConnectionIndex,
    setTokenIndex,
} from './redisStoreIndexSupport'
import { tokenIndexKey } from './storeSupport'
import type { RedisPairingAdapter } from './storeTypes'

export async function applyRedisPairingTransitionEffects(options: {
    adapter: RedisPairingAdapter
    transition: PairingSessionTransition
    ttlSeconds: number
}): Promise<void> {
    for (const op of options.transition.tokenIndexOps) {
        if (op.type === 'delete') {
            await options.adapter.del(tokenIndexKey(op.tokenHash))
            continue
        }
        await setTokenIndex({
            adapter: options.adapter,
            connectionId: op.value.connectionId,
            tokenHash: op.tokenHash,
            pairingId: op.value.pairingId,
            role: op.value.role,
            ttlSeconds: options.ttlSeconds,
        })
    }

    for (const op of options.transition.remoteConnectionOps) {
        if (op.type === 'clear-all') {
            await clearGuestConnectionTokenIndexes(options.adapter, op.pairingId)
            continue
        }
        await saveRemoteConnectionIndex({
            adapter: options.adapter,
            connection: op.connection,
            ttlSeconds: options.ttlSeconds,
        })
    }

    for (const op of options.transition.transientOps) {
        await clearReconnectChallenges(options.adapter, op.pairingId)
        await clearHandoffTicket(options.adapter, op.pairingId)
    }
}
