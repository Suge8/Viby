import type { HubRuntimeStatus } from '@/types'
import { LocalHubPairingClient } from './localHubPairingClient'
import { HubPausedError } from './pairingBridgeControllerSupport'

export function createDeferredHubClient(getStatus: () => HubRuntimeStatus | null): LocalHubPairingClient {
    let client: LocalHubPairingClient | null = null
    let key = ''
    function current(): LocalHubPairingClient {
        const status = getStatus()
        if (!status || status.phase !== 'ready') throw new HubPausedError()
        const nextKey = `${status.localHubUrl}|${status.hubOwnerToken}`
        if (!client || nextKey !== key) {
            client?.closeAllTerminals()
            client = new LocalHubPairingClient({ baseUrl: status.localHubUrl, hubOwnerToken: status.hubOwnerToken })
            key = nextKey
        }
        return client
    }
    return new Proxy({} as LocalHubPairingClient, {
        get: (_target, property) => {
            const value = (current() as unknown as Record<PropertyKey, unknown>)[property]
            return typeof value === 'function' ? value.bind(current()) : value
        },
    })
}
