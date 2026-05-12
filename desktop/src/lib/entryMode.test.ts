import { describe, expect, it } from 'bun:test'
import type { HubSnapshot } from '../types'
import { buildEntryPreviewModel, deriveInitialEntryMode } from './entryMode'

function makeSnapshot(overrides: Partial<HubSnapshot> = {}): HubSnapshot {
    return {
        running: false,
        managed: false,
        logPath: '/tmp/desktop.log',
        startupConfig: {
            listenHost: '127.0.0.1',
            listenPort: 37173,
            publicAccessEnabled: true,
        },
        ...overrides,
    }
}

describe('entryMode', () => {
    it('uses startup config as initial mode when hub is not running', () => {
        const snapshot = makeSnapshot({
            startupConfig: {
                listenHost: '0.0.0.0',
                listenPort: 4123,
                publicAccessEnabled: true,
            },
        })

        expect(deriveInitialEntryMode(snapshot)).toBe('lan')
    })

    it('prefers startup config over a stale stopped runtime status', () => {
        const snapshot = makeSnapshot({
            startupConfig: {
                listenHost: '127.0.0.1',
                listenPort: 37173,
                publicAccessEnabled: true,
            },
            status: {
                phase: 'stopped',
                pid: 1,
                listenHost: '0.0.0.0',
                listenPort: 4567,
                localHubUrl: 'http://127.0.0.1:4567',
                preferredBrowserUrl: 'http://127.0.0.1:4567',
                publicUrl: 'http://127.0.0.1:4567',
                publicAccessEnabled: true,
                pairingBrokerUrl: 'https://pair.viby.run',
                cliApiToken: 'token',
                settingsFile: '/tmp/settings.toml',
                dataDir: '/tmp',
                startedAt: '2026-03-21T00:00:00.000Z',
                updatedAt: '2026-03-21T00:00:00.000Z',
            },
        })

        expect(deriveInitialEntryMode(snapshot)).toBe('local')
    })

    it('keeps startup preview browser-safe before the runtime publishes its entry URL', () => {
        const model = buildEntryPreviewModel(
            makeSnapshot({
                startupConfig: {
                    listenHost: '0.0.0.0',
                    listenPort: 37173,
                    publicAccessEnabled: true,
                },
            })
        )

        expect(model.isPreview).toBe(true)
        expect(model.mode).toBe('lan')
        expect(model.displayValue).toBe('127.0.0.1:37173')
        expect(model.openUrl).toBeUndefined()
    })

    it('hides custom public Hub entry while public access is disabled', () => {
        const model = buildEntryPreviewModel(
            makeSnapshot({
                running: true,
                status: {
                    phase: 'ready',
                    pid: 1,
                    listenHost: '0.0.0.0',
                    listenPort: 4567,
                    localHubUrl: 'http://127.0.0.1:4567',
                    preferredBrowserUrl: 'https://hub.example.test',
                    publicUrl: 'https://hub.example.test',
                    publicAccessEnabled: false,
                    pairingBrokerUrl: 'https://pair.viby.run',
                    cliApiToken: 'token',
                    settingsFile: '/tmp/settings.toml',
                    dataDir: '/tmp',
                    startedAt: '2026-03-21T00:00:00.000Z',
                    updatedAt: '2026-03-21T00:00:00.000Z',
                },
            })
        )

        expect(model.displayLabel).toBe('局域网地址')
        expect(model.displayValue).toBe('127.0.0.1:4567')
        expect(model.entries.map((entry) => entry.label)).toEqual(['局域网地址', '本机地址'])
        expect(model.openUrl).toBe('http://127.0.0.1:4567')
    })

    it('shows public entry above the LAN address while public access is enabled', () => {
        const snapshot = makeSnapshot({
            running: true,
            status: {
                phase: 'ready',
                pid: 1,
                listenHost: '0.0.0.0',
                listenPort: 4567,
                localHubUrl: 'http://127.0.0.1:4567',
                preferredBrowserUrl: 'http://192.168.1.8:4567',
                publicUrl: 'https://hub.example.test',
                publicAccessEnabled: true,
                pairingBrokerUrl: 'https://pair.viby.run',
                cliApiToken: 'token',
                settingsFile: '/tmp/settings.toml',
                dataDir: '/tmp',
                startedAt: '2026-03-21T00:00:00.000Z',
                updatedAt: '2026-03-21T00:00:00.000Z',
            },
        })

        const model = buildEntryPreviewModel(snapshot)

        expect(model.isPreview).toBe(false)
        expect(model.mode).toBe('lan')
        expect(model.displayLabel).toBe('公网地址')
        expect(model.displayValue).toBe('hub.example.test')
        expect(model.secondaryLabel).toBe('局域网地址')
        expect(model.secondaryValue).toBe('192.168.1.8:4567')
        expect(model.entries.map((entry) => entry.label)).toEqual(['公网地址', '局域网地址', '本机地址'])
        expect(model.entries.map((entry) => entry.value)).toEqual([
            'hub.example.test',
            '192.168.1.8:4567',
            '127.0.0.1:4567',
        ])
        expect(model.openUrl).toBe('https://hub.example.test')
        expect(model.secondaryOpenUrl).toBe('http://192.168.1.8:4567')
    })

    it('does not invent a public entry when the runtime only has a default LAN URL', () => {
        const model = buildEntryPreviewModel(
            makeSnapshot({
                running: true,
                status: {
                    phase: 'ready',
                    pid: 1,
                    listenHost: '0.0.0.0',
                    listenPort: 4567,
                    localHubUrl: 'http://127.0.0.1:4567',
                    preferredBrowserUrl: 'http://192.168.1.8:4567',
                    publicUrl: 'http://192.168.1.8:4567',
                    publicAccessEnabled: true,
                    pairingBrokerUrl: 'https://pair.viby.run',
                    cliApiToken: 'token',
                    settingsFile: '/tmp/settings.toml',
                    dataDir: '/tmp',
                    startedAt: '2026-03-21T00:00:00.000Z',
                    updatedAt: '2026-03-21T00:00:00.000Z',
                },
            })
        )

        expect(model.displayLabel).toBe('局域网地址')
        expect(model.displayValue).toBe('192.168.1.8:4567')
        expect(model.secondaryLabel).toBe('本机地址')
        expect(model.secondaryValue).toBe('127.0.0.1:4567')
        expect(model.entries.map((entry) => entry.label)).toEqual(['局域网地址', '本机地址'])
    })
})
