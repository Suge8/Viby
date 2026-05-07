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
            },
        })

        expect(deriveInitialEntryMode(snapshot)).toBe('lan')
    })

    it('prefers startup config over a stale stopped runtime status', () => {
        const snapshot = makeSnapshot({
            startupConfig: {
                listenHost: '127.0.0.1',
                listenPort: 37173,
            },
            status: {
                phase: 'stopped',
                pid: 1,
                listenHost: '0.0.0.0',
                listenPort: 4567,
                localHubUrl: 'http://127.0.0.1:4567',
                preferredBrowserUrl: 'http://127.0.0.1:4567',
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
                },
            })
        )

        expect(model.isPreview).toBe(true)
        expect(model.mode).toBe('lan')
        expect(model.displayValue).toBe('http://127.0.0.1:37173')
        expect(model.openUrl).toBeUndefined()
    })

    it('shows the LAN address as the primary running entry when available', () => {
        const snapshot = makeSnapshot({
            running: true,
            status: {
                phase: 'ready',
                pid: 1,
                listenHost: '0.0.0.0',
                listenPort: 4567,
                localHubUrl: 'http://127.0.0.1:4567',
                preferredBrowserUrl: 'https://hub.example.test',
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
        expect(model.displayLabel).toBe('局域网地址')
        expect(model.displayValue).toBe('https://hub.example.test')
        expect(model.secondaryLabel).toBe('本机地址')
        expect(model.secondaryValue).toBe('http://127.0.0.1:4567')
        expect(model.openUrl).toBe('https://hub.example.test')
        expect(model.secondaryOpenUrl).toBe('http://127.0.0.1:4567')
    })
})
