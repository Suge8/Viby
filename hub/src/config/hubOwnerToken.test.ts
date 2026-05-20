import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseVibyLocalSettingsToml } from '@viby/protocol/localSettings'
import { getOrCreateHubOwnerToken } from './hubOwnerToken'

const tempDirs: string[] = []
const envSnapshot = new Map<string, string | undefined>()
const TOKEN_ENV_KEYS = ['VIBY_HUB_OWNER_TOKEN', 'CLI_API_TOKEN'] as const

beforeEach(() => {
    for (const key of TOKEN_ENV_KEYS) {
        envSnapshot.set(key, process.env[key])
        delete process.env[key]
    }
})

afterEach(async () => {
    for (const key of TOKEN_ENV_KEYS) {
        const value = envSnapshot.get(key)
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }
    envSnapshot.clear()

    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (dir) await rm(dir, { recursive: true, force: true })
    }
})

async function createTempDataDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'viby-hub-owner-token-'))
    tempDirs.push(dir)
    return dir
}

describe('getOrCreateHubOwnerToken', () => {
    it('persists the renamed env owner token into the renamed settings field', async () => {
        const dataDir = await createTempDataDir()
        process.env.VIBY_HUB_OWNER_TOKEN = 'owner-token-from-env'

        const result = await getOrCreateHubOwnerToken(dataDir)
        const settings = parseVibyLocalSettingsToml(await readFile(join(dataDir, 'settings.toml'), 'utf8'))

        expect(result).toMatchObject({ token: 'owner-token-from-env', source: 'env', isNew: false })
        expect(settings.hubOwnerToken).toBe('owner-token-from-env')
    })

    it('ignores the removed CLI_API_TOKEN env name', async () => {
        const dataDir = await createTempDataDir()
        process.env.CLI_API_TOKEN = 'legacy-token'

        const result = await getOrCreateHubOwnerToken(dataDir)

        expect(result.token).not.toBe('legacy-token')
        expect(result.source).toBe('generated')
        expect(result.isNew).toBe(true)
    })
})
