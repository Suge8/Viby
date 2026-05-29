export function buildPairingInviteUrl(baseUrl: string, pairingId: string): string {
    return new URL(`/p/${pairingId}`, baseUrl).toString()
}

export function buildPairingWsUrl(baseUrl: string, pairingId: string, token: string): string {
    const url = new URL(`/pairings/${pairingId}/ws`, baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('token', token)
    return url.toString()
}

export function buildPairingTunnelUrl(baseUrl: string, pairingId: string, token: string): string {
    const url = new URL(`/pairings/${pairingId}/tunnel`, baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('token', token)
    return url.toString()
}

export function buildPairingEventsUrl(baseUrl: string, pairingId: string, token: string): string {
    const url = new URL(`/pairings/${pairingId}/events`, baseUrl)
    url.searchParams.set('token', token)
    return url.toString()
}
