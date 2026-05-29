import type { PairingIceServer } from '@viby/protocol/pairing'

export interface PairingIceServerConfig {
    stunUrls: readonly string[]
}

export function parseCsvUrls(raw: string | undefined | null): string[] {
    if (!raw) {
        return []
    }

    return raw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
}

export function buildIceServers(config: PairingIceServerConfig): PairingIceServer[] {
    return config.stunUrls.map((stunUrl) => ({ urls: stunUrl }))
}
