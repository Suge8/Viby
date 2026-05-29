import { isProtocolVersionCompatible, resolvePeerProtocolVersion } from '@viby/protocol'
import { buildApiUrl } from '@/api/clientShared'

const HUB_HEALTH_PATH = '/health'
const UPDATE_DESKTOP_ERROR_KEY = 'runtimeCompatibility.error.updateDesktop'

type HubHealthPayload = {
    protocolVersion?: unknown
}

export class HubProtocolCompatibilityError extends Error {
    constructor() {
        super(UPDATE_DESKTOP_ERROR_KEY)
        this.name = 'HubProtocolCompatibilityError'
    }
}

function readHealthProtocolVersion(payload: unknown): number {
    const record = typeof payload === 'object' && payload !== null ? (payload as HubHealthPayload) : {}
    return resolvePeerProtocolVersion(record.protocolVersion)
}

export async function assertHubProtocolCompatibility(baseUrl: string): Promise<void> {
    let response: Response
    try {
        response = await fetch(buildApiUrl(baseUrl, HUB_HEALTH_PATH), {
            cache: 'no-store',
            headers: { accept: 'application/json' },
        })
    } catch {
        return
    }
    if (!response.ok) return

    let payload: unknown = null
    try {
        payload = await response.json()
    } catch {
        return
    }
    if (!isProtocolVersionCompatible(readHealthProtocolVersion(payload))) {
        throw new HubProtocolCompatibilityError()
    }
}
