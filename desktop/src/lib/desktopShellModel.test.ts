import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession } from '@/types'
import { buildHubSwitchModel, getPairingInviteRenewDelay, shouldDismissPairingInvite } from './desktopShellModel'

const pairingFixture: DesktopPairingSession = {
    pairing: {
        id: 'pairing-1',
        state: 'waiting',
        createdAt: 1,
        updatedAt: 1,
        expiresAt: 2,
        expiresAt: 2,
        shortCode: null,
        approvalStatus: null,
        host: { tokenHint: 'host-1' },
        guest: null,
    },
    hostToken: 'host-token',
    pairingUrl: 'https://pair.example.com/p/pairing-1#ticket=secret',
    wsUrl: 'wss://pair.example.com/pairings/pairing-1/ws?token=host-token',
    tunnelUrl: 'wss://pair.example.com/pairings/pairing-1/tunnel?token=host-token',
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

    it('dismisses broker invites only after approval and a ready bridge', () => {
        expect(shouldDismissPairingInvite({ source: 'broker', approved: false, bridgePhase: 'ready' })).toBe(false)
        expect(shouldDismissPairingInvite({ source: 'broker', approved: true, bridgePhase: 'connecting' })).toBe(false)
        expect(shouldDismissPairingInvite({ source: 'broker', approved: true, bridgePhase: 'ready' })).toBe(true)
        expect(shouldDismissPairingInvite({ source: 'lan', approved: true, bridgePhase: null })).toBe(true)
    })

    it('renews only unclaimed QR invites shortly before ticket expiry', () => {
        const now = 1_000
        const expiresAt = now + 60_000
        expect(
            getPairingInviteRenewDelay({ ...pairingFixture, pairing: { ...pairingFixture.pairing, expiresAt } }, now)
        ).toBe(30_000)
        expect(
            getPairingInviteRenewDelay(
                { ...pairingFixture, pairing: { ...pairingFixture.pairing, expiresAt: now + 10_000 } },
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
})
