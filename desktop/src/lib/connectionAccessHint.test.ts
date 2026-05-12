import { describe, expect, it } from 'bun:test'
import { shouldShowDeviceAllAccessOffHint } from './connectionAccessHint'

describe('shouldShowDeviceAllAccessOffHint', () => {
    it('returns true when both access channels are off and no device is connected so the user is guided toward the local-link entry', () => {
        expect(
            shouldShowDeviceAllAccessOffHint({
                deviceActionVisible: false,
                activeDeviceCount: 0,
            })
        ).toBe(true)
    })

    it('returns false while the QR action is visible because the user can already issue an invite from this card', () => {
        expect(
            shouldShowDeviceAllAccessOffHint({
                deviceActionVisible: true,
                activeDeviceCount: 0,
            })
        ).toBe(false)
    })

    it('returns false once at least one device has bound because the card no longer reads as empty', () => {
        expect(
            shouldShowDeviceAllAccessOffHint({
                deviceActionVisible: false,
                activeDeviceCount: 1,
            })
        ).toBe(false)
    })
})
