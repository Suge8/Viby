import { isLocalNetworkUrl } from './networkScope'
import type { HubRuntimeStatus } from './runtimeStatus'

export type HubAccessScope = 'public' | 'lan' | 'local'

export interface HubAccessEntry {
    scope: HubAccessScope
    url: string
}

const WILDCARD_LISTEN_HOSTS = new Set(['0.0.0.0', '::'])

export function isWildcardListenHost(listenHost: string): boolean {
    return WILDCARD_LISTEN_HOSTS.has(listenHost)
}

function selectPublicUrl(status: HubRuntimeStatus): string | null {
    if (!status.publicAccessEnabled) return null
    if (isLocalNetworkUrl(status.publicUrl)) return null
    return status.publicUrl
}

function selectLanUrl(status: HubRuntimeStatus): string | null {
    if (!isWildcardListenHost(status.listenHost)) return null
    return isLocalNetworkUrl(status.preferredBrowserUrl) ? status.preferredBrowserUrl : status.localHubUrl
}

export function buildHubAccessEntries(status: HubRuntimeStatus): HubAccessEntry[] {
    const entries: HubAccessEntry[] = []
    const publicUrl = selectPublicUrl(status)
    if (publicUrl) entries.push({ scope: 'public', url: publicUrl })
    const lanUrl = selectLanUrl(status)
    if (lanUrl) entries.push({ scope: 'lan', url: lanUrl })
    entries.push({ scope: 'local', url: status.localHubUrl })
    return entries
}

export interface HubPairingHint {
    brokerHost: string
    brokerUrl: string
}

export function buildHubPairingHint(status: HubRuntimeStatus): HubPairingHint | null {
    if (!status.publicAccessEnabled) return null
    const brokerUrl = status.pairingBrokerUrl?.trim()
    if (!brokerUrl) return null
    try {
        return { brokerHost: new URL(brokerUrl).hostname, brokerUrl }
    } catch {
        return null
    }
}
