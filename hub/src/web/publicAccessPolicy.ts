import { isLocalNetworkHostnameOrMissing } from '@viby/protocol/networkScope'

function firstHeaderValue(value: string | null): string | null {
    return value?.split(',')[0]?.trim() || null
}

function hostnameFromHost(value: string | null): string | null {
    const host = firstHeaderValue(value)
    if (!host) return null
    try {
        return new URL(`http://${host}`).hostname.toLowerCase()
    } catch {
        return null
    }
}

function hostnameFromOrigin(value: string | null): string | null {
    const origin = firstHeaderValue(value)
    if (!origin) return null
    try {
        return new URL(origin).hostname.toLowerCase()
    } catch {
        return null
    }
}

function hostnameFromForwardedFor(value: string | null): string | null {
    const forwardedFor = firstHeaderValue(value)
    return forwardedFor?.replace(/^\[|\]$/g, '').toLowerCase() || null
}

export function isAllowedByPublicAccessPolicy(request: Request, publicAccessEnabled: boolean): boolean {
    if (publicAccessEnabled) return true

    const headers = request.headers
    const forwardedHost = hostnameFromHost(headers.get('x-forwarded-host'))
    const host = forwardedHost ?? hostnameFromHost(headers.get('host')) ?? new URL(request.url).hostname
    const origin = hostnameFromOrigin(headers.get('origin'))
    const client =
        hostnameFromForwardedFor(headers.get('x-forwarded-for')) ?? firstHeaderValue(headers.get('cf-connecting-ip'))

    return (
        isLocalNetworkHostnameOrMissing(host) &&
        isLocalNetworkHostnameOrMissing(origin) &&
        isLocalNetworkHostnameOrMissing(client)
    )
}

export function createPublicAccessDisabledResponse(): Response {
    return Response.json({ error: 'Public access is disabled', code: 'public_access_disabled' }, { status: 403 })
}
