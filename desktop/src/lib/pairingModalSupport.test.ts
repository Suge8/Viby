import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import {
    buildDesktopPairingPresentation,
    buildDesktopPairingQrUrl,
    formatPairingCode,
    shouldOfferPairingCodeCopy,
    shouldStartPairingBridge,
} from './pairingModalSupport'

const basePairing: DesktopPairingSession = {
    pairing: {
        id: 'pairing-1',
        state: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        ticketExpiresAt: 2,
        shortCode: null,
        approvalStatus: null,
        host: { tokenHint: 'host-1' },
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    iceServers: [],
}

describe('pairingModalSupport', () => {
    it('keeps the bridge off before desktop approval completes', () => {
        expect(shouldStartPairingBridge(null)).toBe(false)
        expect(shouldStartPairingBridge(basePairing)).toBe(false)
        expect(
            shouldStartPairingBridge({
                ...basePairing,
                pairing: { ...basePairing.pairing, approvalStatus: 'pending', guest: { label: 'Device' } },
            })
        ).toBe(false)
    })

    it('allows the bridge to start only after approval', () => {
        expect(
            shouldStartPairingBridge({
                ...basePairing,
                pairing: { ...basePairing.pairing, approvalStatus: 'approved', guest: { label: 'Device' } },
            })
        ).toBe(true)
    })

    it('builds action-oriented pairing copy instead of generic loading labels', () => {
        expect(buildDesktopPairingPresentation(basePairing)).toMatchObject({
            codeHint: '',
            guidance: '',
            statusHint: '等待设备扫码',
            stage: 'invite',
        })

        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: '490649',
                    approvalStatus: 'pending',
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            codeValue: '490 649',
            codeHint: '配对码',
            statusHint: null,
            stage: 'approval',
        })

        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: '490649',
                    approvalStatus: 'approved',
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            codeHint: '',
            codeValue: '已连接',
            guidance: '',
            statusHint: null,
            stage: 'bound',
        })
    })

    it('keeps transport recovery out of the add-device modal', () => {
        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: '490649',
                    approvalStatus: 'approved',
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            codeHint: '',
            codeValue: '已连接',
            guidance: '',
            statusHint: null,
            stage: 'bound',
        })
    })

    it('keeps partially claimed snapshots out of the connected state', () => {
        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: null,
                    approvalStatus: null,
                    guest: { label: 'Device' },
                },
            })
        ).toMatchObject({
            codeHint: '等待确认',
            statusHint: '等待设备接入',
            stage: 'invite',
        })
    })

    it('keeps used pairing tickets out of bound phone entry QR codes', () => {
        expect(buildDesktopPairingQrUrl(basePairing)).toBe('https://pair.example.com/p/pairing-1#ticket=secret')
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

    it('only offers the copy affordance while the pairing is in approval stage so users never copy a status label', () => {
        expect(shouldOfferPairingCodeCopy('approval')).toBe(true)
        expect(shouldOfferPairingCodeCopy('invite')).toBe(false)
        expect(shouldOfferPairingCodeCopy('bound')).toBe(false)
    })
})
