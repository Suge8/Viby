import { describe, expect, it } from 'bun:test'
import { buildHubAccessEntries, buildHubPairingHint } from './hubAccessEntries'
import type { HubRuntimeStatus } from './runtimeStatus'

function makeStatus(overrides: Partial<HubRuntimeStatus> = {}): HubRuntimeStatus {
    return {
        phase: 'ready',
        pid: 1,
        listenHost: '127.0.0.1',
        listenPort: 37173,
        localHubUrl: 'http://127.0.0.1:37173',
        preferredBrowserUrl: 'http://127.0.0.1:37173',
        publicUrl: 'http://127.0.0.1:37173',
        publicAccessEnabled: true,
        pairingBrokerUrl: 'https://viby.run',
        hubOwnerToken: 'token',
        settingsFile: '/tmp/settings.toml',
        dataDir: '/tmp/.viby',
        startedAt: '2026-05-12T00:00:00.000Z',
        updatedAt: '2026-05-12T00:00:00.000Z',
        ...overrides,
    }
}

describe('buildHubAccessEntries', () => {
    it('returns local only when bound to loopback with no remote public URL', () => {
        const entries = buildHubAccessEntries(makeStatus())
        expect(entries.map((entry) => entry.scope)).toEqual(['local'])
        expect(entries[0]?.url).toBe('http://127.0.0.1:37173')
    })

    it('includes a LAN entry when bound to wildcard with a reachable preferred URL', () => {
        const entries = buildHubAccessEntries(
            makeStatus({
                listenHost: '0.0.0.0',
                preferredBrowserUrl: 'http://192.168.1.42:37173',
            })
        )
        expect(entries.map((entry) => entry.scope)).toEqual(['lan', 'local'])
        expect(entries[0]?.url).toBe('http://192.168.1.42:37173')
    })

    it('falls back to local hub URL for the LAN entry when preferred URL is not local', () => {
        const entries = buildHubAccessEntries(
            makeStatus({
                listenHost: '0.0.0.0',
                preferredBrowserUrl: 'https://hub.example.com',
            })
        )
        expect(entries.map((entry) => entry.scope)).toEqual(['lan', 'local'])
        expect(entries[0]?.url).toBe('http://127.0.0.1:37173')
    })

    it('exposes a public entry when public URL is remote and public access is enabled', () => {
        const entries = buildHubAccessEntries(
            makeStatus({
                listenHost: '0.0.0.0',
                preferredBrowserUrl: 'http://192.168.1.42:37173',
                publicUrl: 'https://hub.example.com',
            })
        )
        expect(entries.map((entry) => entry.scope)).toEqual(['public', 'lan', 'local'])
    })

    it('omits the public entry when public access is disabled', () => {
        const entries = buildHubAccessEntries(
            makeStatus({
                publicUrl: 'https://hub.example.com',
                publicAccessEnabled: false,
            })
        )
        expect(entries.map((entry) => entry.scope)).toEqual(['local'])
    })
})

describe('buildHubPairingHint', () => {
    it('returns broker host when public access is enabled and broker is configured', () => {
        const hint = buildHubPairingHint(makeStatus())
        expect(hint).toEqual({ brokerHost: 'viby.run', brokerUrl: 'https://viby.run' })
    })

    it('returns null when public access is disabled', () => {
        expect(buildHubPairingHint(makeStatus({ publicAccessEnabled: false }))).toBeNull()
    })

    it('returns null when broker URL is missing', () => {
        expect(buildHubPairingHint(makeStatus({ pairingBrokerUrl: null }))).toBeNull()
    })

    it('returns null when broker URL is invalid', () => {
        expect(buildHubPairingHint(makeStatus({ pairingBrokerUrl: 'not a url' }))).toBeNull()
    })
})
