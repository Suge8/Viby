import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getLatestCliSourceMtimeMs } from './cliInstallStamp'

const tempDirs: string[] = []

afterEach(async () => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (!dir) {
            continue
        }
        await rm(dir, { recursive: true, force: true })
    }
})

async function createCliProject(): Promise<string> {
    const cliRoot = await mkdtemp(join(tmpdir(), 'viby-cli-stamp-'))
    tempDirs.push(cliRoot)
    await mkdir(join(cliRoot, 'src', 'runner'), { recursive: true })
    await writeFile(join(cliRoot, 'package.json'), '{"name":"viby-cli"}')
    await writeFile(join(cliRoot, 'src', 'runner', 'run.ts'), 'export {}')
    return cliRoot
}

describe('getLatestCliSourceMtimeMs', () => {
    it('tracks the newest mtime across package.json and src tree', async () => {
        const cliRoot = await createCliProject()
        const packageJsonPath = join(cliRoot, 'package.json')
        const srcPath = join(cliRoot, 'src')
        const runnerPath = join(cliRoot, 'src', 'runner')
        const sourceFilePath = join(cliRoot, 'src', 'runner', 'run.ts')
        const olderTime = new Date('2026-03-23T05:00:00.000Z')
        const newerTime = new Date('2026-03-23T05:00:10.000Z')

        await utimes(packageJsonPath, olderTime, olderTime)
        await utimes(srcPath, olderTime, olderTime)
        await utimes(runnerPath, olderTime, olderTime)
        await utimes(sourceFilePath, newerTime, newerTime)

        expect(getLatestCliSourceMtimeMs(cliRoot)).toBe(newerTime.getTime())
    })

    it('returns undefined when neither package.json nor src exists', () => {
        expect(getLatestCliSourceMtimeMs('/tmp/viby-cli-stamp-missing')).toBeUndefined()
    })
})
