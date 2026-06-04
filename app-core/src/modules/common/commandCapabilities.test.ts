import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCommandCapabilitySnapshot, listCommandCapabilities } from './commandCapabilities'
import { resetCommandCapabilityCache } from './commandCapabilityCache'

async function writeSkill(skillDir: string, name: string, description: string): Promise<void> {
    await mkdir(skillDir, { recursive: true })
    await writeFile(
        join(skillDir, 'SKILL.md'),
        ['---', `name: ${name}`, `description: ${description}`, '---', '', `# ${name}`].join('\n')
    )
}

describe('listCommandCapabilities', () => {
    const originalHome = process.env.HOME
    let sandboxDir: string
    let homeDir: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'viby-command-capabilities-'))
        homeDir = join(sandboxDir, 'home')
        projectDir = join(sandboxDir, 'project')
        process.env.HOME = homeDir

        await mkdir(join(homeDir, '.agents', 'skills'), { recursive: true })
        await mkdir(join(projectDir, '.git'), { recursive: true })
    })

    afterEach(async () => {
        resetCommandCapabilityCache()
        if (originalHome === undefined) {
            delete process.env.HOME
        } else {
            process.env.HOME = originalHome
        }

        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('merges native slash commands with Viby skills into one capability list', async () => {
        await writeSkill(join(homeDir, '.agents', 'skills', 'build'), 'build', 'Build skill')

        const capabilities = await listCommandCapabilities('codex', projectDir)

        expect(capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    trigger: '/new',
                    provider: 'codex',
                    kind: 'native_command',
                    selectionMode: 'action',
                    actionType: 'open_new_session',
                }),
                expect.objectContaining({
                    trigger: '$build',
                    provider: 'shared',
                    kind: 'viby_skill',
                    selectionMode: 'insert',
                }),
            ])
        )
        expect(capabilities.some((capability) => capability.trigger === '/resume')).toBe(false)
    })

    it('includes visible ~/.codex skills in the unified capability list', async () => {
        await writeSkill(join(homeDir, '.codex', 'skills', 'ship'), 'ship', 'Ship skill')
        await writeSkill(join(homeDir, '.codex', 'skills', '.system', 'hidden'), 'hidden', 'Hidden skill')

        const capabilities = await listCommandCapabilities('codex', projectDir)

        expect(capabilities).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    trigger: '$ship',
                    provider: 'shared',
                    kind: 'viby_skill',
                    selectionMode: 'insert',
                }),
            ])
        )
        expect(capabilities.some((capability) => capability.trigger === '$hidden')).toBe(false)
    })

    it('invalidates cached capabilities when the watched command directory changes', async () => {
        const commandsDir = join(projectDir, '.gemini', 'commands')
        await mkdir(commandsDir, { recursive: true })
        await writeFile(join(commandsDir, 'ship.toml'), 'description = "Ship"\nprompt = "ship it"\n')

        const initialSnapshot = await getCommandCapabilitySnapshot('gemini', projectDir)
        expect(initialSnapshot.capabilities.some((capability) => capability.trigger === '/ship')).toBe(true)

        await writeFile(join(commandsDir, 'ship.toml'), 'description = "Release"\nprompt = "release it"\n')

        const startedAt = Date.now()
        while (true) {
            const refreshedSnapshot = await getCommandCapabilitySnapshot('gemini', projectDir)
            const shipCapability = refreshedSnapshot.capabilities.find((capability) => capability.trigger === '/ship')
            if (shipCapability?.description === 'Release') {
                expect(shipCapability.description).toBe('Release')
                expect(refreshedSnapshot.revision).not.toBe(initialSnapshot.revision)
                break
            }

            if (Date.now() - startedAt > 2_000) {
                throw new Error('command capability cache did not invalidate after slash command change')
            }

            await new Promise((resolve) => setTimeout(resolve, 50))
        }
    })
})
