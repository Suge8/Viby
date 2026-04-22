export const PAIRING_TICKET_FRAGMENT_KEY = 'ticket'

export function buildPairingClaimUrl(baseUrl: string, pairingId: string, ticket: string): string {
    const url = new URL(`/p/${pairingId}`, baseUrl)
    url.hash = `${PAIRING_TICKET_FRAGMENT_KEY}=${encodeURIComponent(ticket)}`
    return url.toString()
}

export function buildPairingWsUrl(baseUrl: string, pairingId: string, token: string): string {
    const url = new URL(`/pairings/${pairingId}/ws`, baseUrl)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('token', token)
    return url.toString()
}

export function readPairingTicketFromUrl(url: string): string | null {
    const parsedUrl = new URL(url)
    if (!parsedUrl.hash) {
        return null
    }

    const params = new URLSearchParams(parsedUrl.hash.slice(1))
    return params.get(PAIRING_TICKET_FRAGMENT_KEY)
}
