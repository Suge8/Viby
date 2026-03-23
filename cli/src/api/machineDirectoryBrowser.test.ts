import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleBrowseMachineDirectoryRequest } from './machineDirectoryBrowser'

async function createTempDir(prefix: string): Promise<string> {
    const path = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(path, { recursive: true })
    return path
}

describe('handleBrowseMachineDirectoryRequest', () => {
    const originalHome = process.env.HOME
    let homeDir = ''

    beforeEach(async () => {
        homeDir = await createTempDir('viby-machine-directory')
        process.env.HOME = homeDir

        await mkdir(join(homeDir, 'Projects', 'alpha'), { recursive: true })
        await mkdir(join(homeDir, 'Desktop'), { recursive: true })
        await writeFile(join(homeDir, 'README.md'), '# test')
    })

    afterEach(async () => {
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }

        if (homeDir) {
            await rm(homeDir, { recursive: true, force: true })
        }

        vi.restoreAllMocks()
    })

    it('uses home as the default browse root and returns suggested roots', async () => {
        const response = await handleBrowseMachineDirectoryRequest({})

        expect(response.success).toBe(true)
        expect(response.currentPath).toBe(homeDir)
        expect(response.entries?.map((entry) => entry.name)).toContain('Projects')
        expect(response.entries?.every((entry) => entry.type === 'directory')).toBe(true)
        expect(response.roots).toEqual(
            expect.arrayContaining([
                { kind: 'home', path: homeDir },
                { kind: 'desktop', path: join(homeDir, 'Desktop') },
                { kind: 'projects', path: join(homeDir, 'Projects') }
            ])
        )
    })

    it('resolves relative paths against home', async () => {
        const response = await handleBrowseMachineDirectoryRequest({ path: 'Projects' })

        expect(response.success).toBe(true)
        expect(response.currentPath).toBe(join(homeDir, 'Projects'))
        expect(response.parentPath).toBe(homeDir)
        expect(response.entries?.map((entry) => entry.name)).toEqual(['alpha'])
    })

    it('returns roots alongside browse errors', async () => {
        const response = await handleBrowseMachineDirectoryRequest({ path: join(homeDir, 'missing') })

        expect(response.success).toBe(false)
        expect(response.error).toBeTruthy()
        expect(response.roots).toEqual(expect.arrayContaining([{ kind: 'home', path: homeDir }]))
    })
})
