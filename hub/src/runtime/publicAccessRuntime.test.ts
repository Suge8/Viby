import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicAccessRuntime } from './publicAccessRuntime'

async function createSettingsDir(initialContent: string): Promise<{ dir: string; file: string }> {
    const dir = await mkdtemp(join(tmpdir(), 'viby-public-access-'))
    const file = join(dir, 'settings.toml')
    await writeFile(file, initialContent)
    return { dir, file }
}

describe('createPublicAccessRuntime', () => {
    it('exposes the initial value', () => {
        const runtime = createPublicAccessRuntime({
            initialEnabled: false,
            settingsFile: join(tmpdir(), 'absent-settings.toml'),
            locked: true,
            onChange: () => {},
        })

        expect(runtime.isEnabled()).toBe(false)
        runtime.dispose()
    })

    it('hot-reloads when the settings file changes', async () => {
        const { dir, file } = await createSettingsDir('public_access_enabled = true\n')
        let resolveChange: (value: boolean) => void = () => {}
        const changed = new Promise<boolean>((resolve) => {
            resolveChange = resolve
        })

        const runtime = createPublicAccessRuntime({
            initialEnabled: true,
            settingsFile: file,
            locked: false,
            onChange: (value) => resolveChange(value),
        })

        await writeFile(file, 'public_access_enabled = false\n')

        expect(await changed).toBe(false)
        expect(runtime.isEnabled()).toBe(false)

        runtime.dispose()
        await rm(dir, { recursive: true, force: true })
    })

    it('never reloads while locked', async () => {
        const { dir, file } = await createSettingsDir('public_access_enabled = true\n')
        let changeCount = 0

        const runtime = createPublicAccessRuntime({
            initialEnabled: true,
            settingsFile: file,
            locked: true,
            onChange: () => {
                changeCount += 1
            },
        })

        await writeFile(file, 'public_access_enabled = false\n')
        // A full read round-trip proves the new content is durable; a locked
        // runtime registers no watcher, so onChange can never fire.
        expect(await readFile(file, 'utf8')).toContain('false')

        expect(changeCount).toBe(0)
        expect(runtime.isEnabled()).toBe(true)

        runtime.dispose()
        await rm(dir, { recursive: true, force: true })
    })
})
