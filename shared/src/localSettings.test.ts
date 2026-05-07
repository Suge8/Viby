import { describe, expect, it } from 'bun:test'
import { parseVibyLocalSettingsToml, stringifyVibyLocalSettingsToml } from './localSettings'

describe('localSettings', () => {
    it('round-trips pairing broker settings through the shared settings owner', () => {
        const serialized = stringifyVibyLocalSettingsToml({
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })

        expect(parseVibyLocalSettingsToml(serialized)).toMatchObject({
            pairingBrokerUrl: 'https://pair.viby.run',
            pairingCreateToken: 'pair-secret',
        })
    })
})
