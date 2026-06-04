import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { awaitFileExist } from './awaitFileExist'

async function withTempDir<T>(action: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), 'viby-await-file.'))
    try {
        return await action(dir)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

describe('awaitFileExist', () => {
    it('resolves true for an existing file', async () => {
        await withTempDir(async (dir) => {
            const file = join(dir, 'session.jsonl')
            writeFileSync(file, '')

            await expect(awaitFileExist(file, 50)).resolves.toBe(true)
        })
    })

    it('resolves when the watched file is created', async () => {
        await withTempDir(async (dir) => {
            const file = join(dir, 'session.jsonl')
            const waiting = awaitFileExist(file, 1_000)
            setTimeout(() => writeFileSync(file, ''), 0)

            await expect(waiting).resolves.toBe(true)
        })
    })

    it('resolves false on timeout without polling the filesystem', async () => {
        await withTempDir(async (dir) => {
            await expect(awaitFileExist(join(dir, 'missing.jsonl'), 10)).resolves.toBe(false)
        })
    })

    it('resolves false when the parent directory cannot be watched', async () => {
        await expect(awaitFileExist(join(tmpdir(), 'viby-missing-parent', 'missing.jsonl'), 50)).resolves.toBe(false)
    })
})
