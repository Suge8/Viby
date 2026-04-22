import {
    type PairingCreateRequest,
    PairingCreateRequestSchema,
    type PairingCreateResponse,
    PairingCreateResponseSchema,
} from '@viby/protocol/pairing'
import { configuration, hasConfiguration } from '../configuration'

export interface PairingBrokerClient {
    isConfigured(): boolean
    createPairing(input: PairingCreateRequest): Promise<PairingCreateResponse>
}

interface CreatePairingBrokerClientOptions {
    brokerUrl?: string | null
    createToken?: string | null
    fetchImpl?: typeof fetch
}

function trimBrokerUrl(value: string | null | undefined): string | null {
    const trimmed = value?.trim()
    return trimmed ? trimmed.replace(/\/+$/, '') : null
}

function parseErrorMessage(status: number, bodyText: string): string {
    if (!bodyText) {
        return `Pairing broker request failed with HTTP ${status}`
    }

    try {
        const parsed = JSON.parse(bodyText) as { error?: string }
        if (typeof parsed.error === 'string' && parsed.error) {
            return parsed.error
        }
    } catch {
        // ignore invalid JSON error payload
    }

    return `Pairing broker request failed with HTTP ${status}: ${bodyText}`
}

function resolveBrokerUrl(options: CreatePairingBrokerClientOptions): string | null {
    if (typeof options.brokerUrl !== 'undefined') {
        return trimBrokerUrl(options.brokerUrl)
    }

    return hasConfiguration() ? trimBrokerUrl(configuration.pairingBrokerUrl) : null
}

function resolveCreateToken(options: CreatePairingBrokerClientOptions): string | null {
    if (typeof options.createToken !== 'undefined') {
        return options.createToken
    }

    return hasConfiguration() ? configuration.pairingCreateToken : null
}

export function createPairingBrokerClient(options: CreatePairingBrokerClientOptions = {}): PairingBrokerClient {
    const brokerUrl = resolveBrokerUrl(options)
    const createToken = resolveCreateToken(options)
    const fetchImpl = options.fetchImpl ?? fetch

    return {
        isConfigured(): boolean {
            return Boolean(brokerUrl)
        },

        async createPairing(input: PairingCreateRequest): Promise<PairingCreateResponse> {
            if (!brokerUrl) {
                throw new Error('Pairing broker is not configured.')
            }

            const parsedInput = PairingCreateRequestSchema.parse(input)
            const headers = new Headers({ 'content-type': 'application/json' })
            if (createToken) {
                headers.set('authorization', `Bearer ${createToken}`)
            }

            const response = await fetchImpl(`${brokerUrl}/pairings`, {
                method: 'POST',
                headers,
                body: JSON.stringify(parsedInput),
            })

            const bodyText = await response.text()
            if (!response.ok) {
                throw new Error(parseErrorMessage(response.status, bodyText))
            }

            const parsedBody = JSON.parse(bodyText)
            return PairingCreateResponseSchema.parse(parsedBody)
        },
    }
}
