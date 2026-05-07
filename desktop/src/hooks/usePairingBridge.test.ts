import { describe, expect, it } from 'bun:test'
import type { DesktopPairingSession, HubRuntimeStatus } from '@/types'
import { createPairingBridgeDependencyKey } from './usePairingBridge'

const statusFixture: HubRuntimeStatus = {
    phase: 'ready',
    pid: 42,
    launchSource: 'desktop',
    listenHost: '127.0.0.1',
    listenPort: 37173,
    localHubUrl: 'http://127.0.0.1:37173',
    preferredBrowserUrl: 'http://127.0.0.1:37173',
    cliApiToken: 'token-1',
    settingsFile: '/tmp/settings.toml',
    dataDir: '/tmp/viby',
    startedAt: '2026-04-23T00:00:00.000Z',
    updatedAt: '2026-04-23T00:00:00.000Z',
}

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

describe('usePairingBridge dependency key', () => {
    it('stays stable across noisy runtime snapshot refreshes', () => {
        const initial = createPairingBridgeDependencyKey(pairingFixture, statusFixture)
        const refreshed = createPairingBridgeDependencyKey(pairingFixture, {
            ...statusFixture,
            updatedAt: '2026-04-23T00:00:02.000Z',
            message: 'still ready',
        })

        expect(refreshed).toBe(initial)
    })

    it('changes when the active pairing transport endpoint changes', () => {
        const initial = createPairingBridgeDependencyKey(pairingFixture, statusFixture)
        const next = createPairingBridgeDependencyKey(
            {
                ...pairingFixture,
                pairing: { ...pairingFixture.pairing, id: 'pairing-2' },
                wsUrl: 'wss://pair.example.com/pairings/pairing-2/ws?token=host-token-2',
            },
            statusFixture
        )

        expect(next).not.toBe(initial)
    })
})
