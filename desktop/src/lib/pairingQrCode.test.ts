import { describe, expect, it } from 'bun:test'
import { buildPairingQrCodeModel } from './pairingQrCode'

describe('pairingQrCode', () => {
    it('builds a synchronous svg path model', () => {
        const model = buildPairingQrCodeModel('https://pair.example.com/p/pairing-1')

        expect(model.viewBox).toMatch(/^-2 -2 \d+ \d+$/)
        expect(model.path.startsWith('M')).toBe(true)
        expect(model.path).toContain('h1v1H')
    })
})
