import { describe, expect, it } from 'bun:test'
import { parseVibyLocalSettingsToml, stringifyVibyLocalSettingsToml } from './localSettings'

describe('localSettings', () => {
    it('round-trips public access and pairing broker settings through the shared settings owner', () => {
        const serialized = stringifyVibyLocalSettingsToml({
            publicAccessEnabled: false,
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })

        expect(parseVibyLocalSettingsToml(serialized)).toMatchObject({
            publicAccessEnabled: false,
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })
    })
})
