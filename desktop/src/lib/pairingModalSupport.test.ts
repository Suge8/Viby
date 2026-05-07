import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import { buildDesktopPairingPresentation, formatPairingCode, shouldStartPairingBridge } from './pairingModalSupport'

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
                pairing: { ...basePairing.pairing, approvalStatus: 'pending', guest: { label: 'Phone' } },
            })
        ).toBe(false)
    })

    it('allows the bridge to start only after approval', () => {
        expect(
            shouldStartPairingBridge({
                ...basePairing,
                pairing: { ...basePairing.pairing, approvalStatus: 'approved', guest: { label: 'Phone' } },
            })
        ).toBe(true)
    })

    it('builds action-oriented pairing copy instead of generic loading labels', () => {
        expect(buildDesktopPairingPresentation(basePairing)).toMatchObject({
            codeHint: '手机扫码后显示',
            statusHint: '等待手机扫码',
            stage: 'invite',
        })

        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: '490649',
                    approvalStatus: 'pending',
                    guest: { label: 'Phone' },
                },
            })
        ).toMatchObject({
            codeValue: '490 649',
            codeHint: '连接码',
            statusHint: '等待手机输入连接码',
            stage: 'approval',
        })

        expect(
            buildDesktopPairingPresentation({
                ...basePairing,
                pairing: {
                    ...basePairing.pairing,
                    shortCode: '490649',
                    approvalStatus: 'approved',
                    guest: { label: 'Phone' },
                },
            })
        ).toMatchObject({
            codeHint: '已输入',
            statusHint: '正在连接手机',
            stage: 'connecting',
        })
    })

    it('lets the bridge paused phase preserve pairing while the phone is backgrounded', () => {
        expect(
            buildDesktopPairingPresentation(
                {
                    ...basePairing,
                    pairing: {
                        ...basePairing.pairing,
                        shortCode: '490649',
                        approvalStatus: 'approved',
                        guest: { label: 'Phone' },
                    },
                },
                'paused'
            )
        ).toMatchObject({
            codeHint: '已配对',
            statusHint: '手机在后台，回来后自动接回',
            stage: 'paused',
        })
    })

    it('lets the bridge ready phase own the final connected presentation', () => {
        expect(
            buildDesktopPairingPresentation(
                {
                    ...basePairing,
                    pairing: {
                        ...basePairing.pairing,
                        shortCode: '490649',
                        approvalStatus: 'approved',
                        guest: { label: 'Phone' },
                    },
                },
                'ready'
            )
        ).toMatchObject({
            codeHint: '已连接',
            statusHint: '已连接',
            stage: 'ready',
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
                    guest: { label: 'Phone' },
                },
            })
        ).toMatchObject({
            codeHint: '等待确认',
            statusHint: '等待手机接入',
            stage: 'invite',
        })
    })

    it('formats short pairing codes into glanceable groups', () => {
        expect(formatPairingCode(null)).toBe('— — —')
        expect(formatPairingCode('490649')).toBe('490 649')
        expect(formatPairingCode('already-done')).toBe('already-done')
    })
})
