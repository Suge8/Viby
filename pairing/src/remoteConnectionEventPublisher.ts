import { buildPairingHostEventFromStore } from './hostEventPayload'
import type { PairingSessionEventBus } from './sessionEventBus'
import type { PairingStore } from './storeTypes'

export function createRemoteConnectionChangePublisher(
    eventBus: PairingSessionEventBus,
    store: PairingStore,
    getActiveRemoteConnectionIds: (pairingId: string) => ReadonlySet<string>
): (pairingId: string) => Promise<void> {
    return async (pairingId) => {
        const session = await store.getSession(pairingId)
        if (session) eventBus.emit(await buildPairingHostEventFromStore(store, session, getActiveRemoteConnectionIds))
    }
}
