import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadServerSettings } from './serverSettings'

const tempDirs: string[] = []
const SERVER_SETTINGS_ENV_KEYS = [
    'VIBY_LISTEN_HOST',
    'VIBY_LISTEN_PORT',
    'VIBY_PUBLIC_URL',
    'VIBY_PUBLIC_ACCESS_ENABLED',
    'CORS_ORIGINS',
    'PAIRING_BROKER_URL',
    'PAIRING_CREATE_TOKEN',
] as const
const serverSettingsEnvSnapshot = new Map<string, string | undefined>()

beforeEach(() => {
    for (const key of SERVER_SETTINGS_ENV_KEYS) {
        serverSettingsEnvSnapshot.set(key, process.env[key])
        delete process.env[key]
    }
})

afterEach(async () => {
    for (const key of SERVER_SETTINGS_ENV_KEYS) {
        const value = serverSettingsEnvSnapshot.get(key)
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }
    serverSettingsEnvSnapshot.clear()

    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (!dir) {
            continue
        }
        await rm(dir, { recursive: true, force: true })
    }
})

function createSettingsToml(port: number): string {
    return [
        'cli_api_token = "token"',
        `api_url = "http://localhost:${port}"`,
        'listen_host = "127.0.0.1"',
        `listen_port = ${port}`,
        'public_url = ""',
        'public_access_enabled = false',
        'cors_origins = []',
        'pairing_broker_url = "https://pair.example.com"',
        'pairing_create_token = "pair-secret"',
        '',
        '[system]',
        'machine_id = ""',
        'machine_id_confirmed_by_server = false',
        '',
        '[push]',
        'public_key = ""',
        'private_key = ""',
        '',
    ].join('\n')
}

describe('loadServerSettings', () => {
    it('reads the configured port directly from settings.toml', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-server-settings-'))
        tempDirs.push(dataDir)

        const settingsFile = join(dataDir, 'settings.toml')
        await writeFile(settingsFile, createSettingsToml(3007))

        const result = await loadServerSettings(dataDir)

        expect(result.settings.listenPort).toBe(3007)
        expect(result.settings.publicUrl).toBe('http://127.0.0.1:3007')
        expect(result.settings.publicAccessEnabled).toBe(false)
        expect(result.settings.pairingBrokerUrl).toBe('https://pair.example.com')
        expect(result.settings.pairingCreateToken).toBe('pair-secret')
        expect(result.settings.corsOrigins).toEqual([
            'http://127.0.0.1:3007',
            'http://localhost:3007',
            'http://[::1]:3007',
            'http://127.0.0.1:1420',
            'http://localhost:1420',
            'http://[::1]:1420',
            'tauri://localhost',
            'https://tauri.localhost',
        ])
        expect(result.savedToFile).toBe(false)
    })

    it('persists pairing env values so desktop launches do not need shell env', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-server-settings-'))
        tempDirs.push(dataDir)
        process.env.PAIRING_BROKER_URL = 'https://pair.viby.run/'
        process.env.PAIRING_CREATE_TOKEN = 'pair-token'

        const result = await loadServerSettings(dataDir)

        expect(result.settings.publicAccessEnabled).toBe(true)
        expect(result.settings.pairingBrokerUrl).toBe('https://pair.viby.run/')
        expect(result.settings.pairingCreateToken).toBe('pair-token')
        expect(result.sources.pairingBrokerUrl).toBe('env')
        expect(result.sources.pairingCreateToken).toBe('env')
        expect(result.savedToFile).toBe(true)
    })

    it('derives the browser entry from an env listen host instead of stale file public URL', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-server-settings-'))
        tempDirs.push(dataDir)
        const settingsFile = join(dataDir, 'settings.toml')
        await writeFile(
            settingsFile,
            createSettingsToml(37173).replace('public_url = ""', 'public_url = "http://127.0.0.1:37173"')
        )
        process.env.VIBY_LISTEN_HOST = '192.168.12.34'

        const result = await loadServerSettings(dataDir)

        expect(result.settings.listenHost).toBe('192.168.12.34')
        expect(result.settings.publicUrl).toBe('http://192.168.12.34:37173')
        expect(result.sources.publicUrl).toBe('default')
    })

    it('rejects public HTTP hub URLs while public access is enabled', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-server-settings-'))
        tempDirs.push(dataDir)
        process.env.VIBY_PUBLIC_URL = 'http://hub.example.com'

        await expect(loadServerSettings(dataDir)).rejects.toThrow('VIBY_PUBLIC_URL must use HTTPS for public hosts')
    })

    it('defaults public access on and accepts env override', async () => {
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-server-settings-'))
        tempDirs.push(dataDir)
        process.env.VIBY_PUBLIC_ACCESS_ENABLED = 'false'

        const result = await loadServerSettings(dataDir)

        expect(result.settings.publicAccessEnabled).toBe(false)
        expect(result.sources.publicAccessEnabled).toBe('env')
        expect(result.savedToFile).toBe(true)
    })
})
