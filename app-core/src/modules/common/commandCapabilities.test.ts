import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCommandCapabilitySnapshot, listCommandCapabilities } from './commandCapabilities'
import { resetCommandCapabilityCache } from './commandCapabilityCache'

describe('listCommandCapabilities', () => {
    let sandboxDir: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'viby-command-capabilities-'))
        projectDir = join(sandboxDir, 'project')
        await mkdir(join(projectDir, '.git'), { recursive: true })
    })

    afterEach(async () => {
        resetCommandCapabilityCache()
        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('lists native slash commands without synthesizing Viby skills', async () => {
        const oldSkillPath = join(projectDir, '.agents', 'skills', 'build')
        await mkdir(oldSkillPath, { recursive: true })
        await writeFile(join(oldSkillPath, 'SKILL.md'), '# build')

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
            ])
        )
        expect(capabilities.some((capability) => capability.kind === 'native_skill')).toBe(false)
        expect(capabilities.some((capability) => capability.trigger === '$build')).toBe(false)
        expect(capabilities.some((capability) => capability.trigger === '/resume')).toBe(false)
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
