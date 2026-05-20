import { describe, expect, it } from 'bun:test'
import { parseVibyLocalSettingsToml, stringifyVibyLocalSettingsToml } from './localSettings'
import { DEFAULT_PAIRING_BROKER_URL } from './runtimeDefaults'

describe('localSettings', () => {
    it('round-trips public access, broker, and internal owner settings through one owner', () => {
        const serialized = stringifyVibyLocalSettingsToml({
            hubOwnerToken: 'owner-secret',
            publicAccessEnabled: false,
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })

        expect(parseVibyLocalSettingsToml(serialized)).toMatchObject({
            hubOwnerToken: 'owner-secret',
            publicAccessEnabled: false,
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })
    })

    it('writes the product broker default without requiring user env setup', () => {
        const serialized = stringifyVibyLocalSettingsToml({})

        expect(serialized).toContain(`pairing_broker_url = "${DEFAULT_PAIRING_BROKER_URL}"`)
        expect(parseVibyLocalSettingsToml(serialized).pairingBrokerUrl).toBe(DEFAULT_PAIRING_BROKER_URL)
    })
})
