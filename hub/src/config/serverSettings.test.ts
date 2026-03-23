import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadServerSettings } from './serverSettings'

const tempDirs: string[] = []
const SERVER_SETTINGS_ENV_KEYS = [
    'VIBY_LISTEN_HOST',
    'VIBY_LISTEN_PORT',
    'VIBY_PUBLIC_URL',
    'CORS_ORIGINS'
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
        'cors_origins = []',
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
        expect(result.settings.corsOrigins).toEqual([
            'http://127.0.0.1:3007',
            'http://localhost:3007',
            'http://[::1]:3007'
        ])
        expect(result.savedToFile).toBe(false)
    })
})
