import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import {
    buildDesktopPairingPresentation,
    buildDesktopPairingQrUrl,
    formatPairingCode,
    shouldOfferPairingCodeCopy,
} from './pairingModalSupport'

const basePairing: DesktopPairingSession = {
    pairing: {
        id: 'pairing-1',
        state: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        shortCode: '490649',
        approvalStatus: null,
        host: { tokenHint: 'host-1' },
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    tunnelUrl: 'wss://pair.example.com/pairings/pairing-1/tunnel?token=host-token',
    iceServers: [],
}

describe('pairingModalSupport', () => {
    it('shows the six-digit code immediately on the invite stage so copying the link does not hide it', () => {
        expect(buildDesktopPairingPresentation(basePairing)).toMatchObject({
            codeValue: '490 649',
            codeHint: '配对码',
            stage: 'invite',
        })

        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    approvalStatus: 'approved',
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            codeHint: '',
            codeValue: '已连接',
            stage: 'bound',
        })
    })

    it('keeps transport recovery out of the add-device modal', () => {
        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    approvalStatus: 'approved',
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            stage: 'bound',
            codeValue: '已连接',
        })
    })

    it('keeps the invite URL stable across claim, even after a device connects', () => {
        expect(buildDesktopPairingQrUrl(basePairing)).toBe('https://pair.example.com/p/pairing-1')
        expect(
            buildDesktopPairingQrUrl({
                ...basePairing,
                pairing: { ...basePairing.pairing, approvalStatus: 'approved', guest: { label: 'Device' } },
            })
        ).toBe('https://pair.example.com/p/pairing-1')
    })

    it('formats short pairing codes into glanceable groups', () => {
        expect(formatPairingCode(null)).toBe('— — —')
        expect(formatPairingCode('490649')).toBe('490 649')
        expect(formatPairingCode('already-done')).toBe('already-done')
    })

    it('exposes the copy affordance on the invite stage but hides it once approved', () => {
        expect(shouldOfferPairingCodeCopy('invite')).toBe(true)
        expect(shouldOfferPairingCodeCopy('bound')).toBe(false)
    })
})
