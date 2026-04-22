import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSlashCommands } from './slashCommands'

describe('listSlashCommands', () => {
    const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    const originalGeminiHome = process.env.GEMINI_HOME
    let sandboxDir: string
    let claudeConfigDir: string
    let geminiHomeDir: string
    let projectDir: string

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'viby-slash-commands-'))
        claudeConfigDir = join(sandboxDir, 'global-claude')
        geminiHomeDir = join(sandboxDir, 'global-gemini')
        projectDir = join(sandboxDir, 'project')

        process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
        process.env.GEMINI_HOME = geminiHomeDir

        await mkdir(join(claudeConfigDir, 'commands'), { recursive: true })
        await mkdir(join(projectDir, '.claude', 'commands'), { recursive: true })
        await mkdir(join(geminiHomeDir, 'commands'), { recursive: true })
        await mkdir(join(projectDir, '.gemini', 'commands'), { recursive: true })
    })

    afterEach(async () => {
        if (originalClaudeConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR
        } else {
            process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
        }
        if (originalGeminiHome === undefined) {
            delete process.env.GEMINI_HOME
        } else {
            process.env.GEMINI_HOME = originalGeminiHome
        }

        await rm(sandboxDir, { recursive: true, force: true })
    })

    it('keeps backward-compatible behavior when projectDir is not provided', async () => {
        await writeFile(
            join(claudeConfigDir, 'commands', 'global-only.md'),
            ['---', 'description: Global only', '---', '', 'Global command body'].join('\n')
        )

        const commands = await listSlashCommands('claude')
        const command = commands.find((cmd) => cmd.name === 'global-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('user')
        expect(command?.description).toBe('Global only')
    })

    it('loads project-level commands when projectDir is provided', async () => {
        await writeFile(
            join(projectDir, '.claude', 'commands', 'project-only.md'),
            ['---', 'description: Project only', '---', '', 'Project command body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find((cmd) => cmd.name === 'project-only')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Project only')
    })

    it('prefers project command when project and global have same name', async () => {
        await writeFile(
            join(claudeConfigDir, 'commands', 'shared.md'),
            ['---', 'description: Global shared', '---', '', 'Global body'].join('\n')
        )
        await writeFile(
            join(projectDir, '.claude', 'commands', 'shared.md'),
            ['---', 'description: Project shared', '---', '', 'Project body'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const sharedCommands = commands.filter((cmd) => cmd.name === 'shared')

        expect(sharedCommands).toHaveLength(1)
        expect(sharedCommands[0]?.source).toBe('project')
        expect(sharedCommands[0]?.description).toBe('Project shared')
        expect(sharedCommands[0]?.content).toBe('Project body')
    })

    it('loads nested project commands using colon-separated names', async () => {
        await mkdir(join(projectDir, '.claude', 'commands', 'trellis'), { recursive: true })
        await writeFile(
            join(projectDir, '.claude', 'commands', 'trellis', 'start.md'),
            ['---', 'description: Trellis start', '---', '', 'Start flow'].join('\n')
        )

        const commands = await listSlashCommands('claude', projectDir)
        const command = commands.find((cmd) => cmd.name === 'trellis:start')

        expect(command).toBeDefined()
        expect(command?.source).toBe('project')
        expect(command?.description).toBe('Trellis start')
    })

    it('returns empty project commands when project directory does not exist', async () => {
        const nonExistentProjectDir = join(sandboxDir, 'not-exists')

        await expect(listSlashCommands('claude', nonExistentProjectDir)).resolves.toBeDefined()
    })

    it('does not load deprecated Codex project prompts as slash commands', async () => {
        await mkdir(join(projectDir, '.codex', 'prompts'), { recursive: true })
        await writeFile(
            join(projectDir, '.codex', 'prompts', 'project-only.md'),
            ['---', 'description: Project only', '---', '', 'Project prompt body'].join('\n')
        )

        const commands = await listSlashCommands('codex', projectDir)

        expect(commands.find((command) => command.name === 'project-only')).toBeUndefined()
    })

    it('loads Gemini user and project commands from toml files', async () => {
        await writeFile(
            join(geminiHomeDir, 'commands', 'global.toml'),
            ['description = "Global Gemini command"', 'prompt = "Global body"'].join('\n')
        )
        await mkdir(join(projectDir, '.gemini', 'commands', 'git'), { recursive: true })
        await writeFile(
            join(projectDir, '.gemini', 'commands', 'git', 'commit.toml'),
            ['description = "Commit helper"', 'prompt = """', 'Write a commit message', '"""'].join('\n')
        )

        const commands = await listSlashCommands('gemini', projectDir)

        expect(commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'global',
                    source: 'user',
                    description: 'Global Gemini command',
                }),
                expect.objectContaining({
                    name: 'git:commit',
                    source: 'project',
                    description: 'Commit helper',
                    content: 'Write a commit message',
                }),
            ])
        )
    })
})
