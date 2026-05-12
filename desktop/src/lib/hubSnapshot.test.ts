import { describe, expect, it } from 'bun:test'
import type { HubSnapshot } from '@/types'
import { deriveHubViewState } from './hubSnapshot'

const startingSnapshot: HubSnapshot = {
    running: true,
    managed: true,
    logPath: '/tmp/desktop-hub.log',
    startupConfig: {
        listenHost: '127.0.0.1',
        listenPort: 37173,
        publicAccessEnabled: true,
    },
    status: {
        phase: 'starting',
        pid: 42,
        launchSource: 'desktop',
        listenHost: '127.0.0.1',
        listenPort: 37173,
        localHubUrl: 'http://127.0.0.1:37173',
        preferredBrowserUrl: 'http://127.0.0.1:37173',
        publicUrl: 'http://127.0.0.1:37173',
        publicAccessEnabled: true,
        pairingBrokerUrl: 'https://pair.viby.run',
        cliApiToken: '',
        settingsFile: '/tmp/settings.toml',
        dataDir: '/tmp',
        startedAt: '2026-04-26T00:00:00.000Z',
        updatedAt: '2026-04-26T00:00:00.000Z',
    },
}

describe('hubSnapshot', () => {
    it('projects supervisor launching snapshots as booting', () => {
        expect(deriveHubViewState(startingSnapshot)).toEqual({
            managed: true,
            running: true,
            ready: false,
            booting: true,
            displayedPhase: 'starting',
        })
    })
})
