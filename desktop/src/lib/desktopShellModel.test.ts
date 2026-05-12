import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import {
    buildDeviceCount,
    buildHubSwitchModel,
    getPairingInviteRenewDelay,
    shouldPollPairingSnapshot,
} from './desktopShellModel'

const pairingFixture: DesktopPairingSession = {
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

describe('desktopShellModel', () => {
    it('keeps the hub switch as a clear start/stop control', () => {
        expect(buildHubSwitchModel({ action: null, busy: false, running: false, ready: false })).toMatchObject({
            tone: 'off',
            label: '开启中枢',
            disabled: false,
        })
        expect(buildHubSwitchModel({ action: null, busy: false, running: true, ready: true })).toMatchObject({
            tone: 'on',
            label: '运行中',
            actionLabel: '关闭中枢',
        })
        expect(buildHubSwitchModel({ action: null, busy: false, running: true, ready: false })).toMatchObject({
            tone: 'busy',
            label: '启动中',
            disabled: true,
        })
        expect(buildHubSwitchModel({ action: 'stop', busy: true, running: true, ready: true })).toMatchObject({
            tone: 'stopping',
            label: '关闭中',
            disabled: true,
        })
    })

    it('counts devices only from Hub device auth summary', () => {
        expect(buildDeviceCount(false, 1)).toBe(0)
        expect(buildDeviceCount(true, 0)).toBe(0)
        expect(buildDeviceCount(true, 2)).toBe(2)
    })

    it('renews only unclaimed QR invites shortly before ticket expiry', () => {
        const now = 1_000
        const ticketExpiresAt = now + 60_000
        expect(
            getPairingInviteRenewDelay(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, ticketExpiresAt } },
                now
            )
        ).toBe(30_000)
        expect(
            getPairingInviteRenewDelay(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, ticketExpiresAt: now + 10_000 } },
                now
            )
        ).toBe(0)
        expect(
            getPairingInviteRenewDelay(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, guest: { label: 'Device' } } },
                now
            )
        ).toBeNull()
    })

    it('polls only visible invites or claimed approvals, not hidden idle QR codes', () => {
        expect(shouldPollPairingSnapshot(pairingFixture, 'idle')).toBe(false)
        expect(shouldPollPairingSnapshot(pairingFixture, 'connecting', true)).toBe(true)
        expect(shouldPollPairingSnapshot(pairingFixture, 'ready', true)).toBe(false)
        expect(
            shouldPollPairingSnapshot(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, guest: { label: 'Device' } } },
                'idle'
            )
        ).toBe(true)
        expect(
            shouldPollPairingSnapshot(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, approvalStatus: 'approved' } },
                'idle',
                true
            )
        ).toBe(false)
        expect(shouldPollPairingSnapshot(null, 'idle', true)).toBe(false)
    })
})
