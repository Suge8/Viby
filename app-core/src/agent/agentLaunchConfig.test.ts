import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAgentLaunchConfig } from './agentLaunchConfig'

const envKeys = [
    'ANTHROPIC_MODEL',
    'CLAUDE_MODEL',
    'CLAUDE_CODE_EFFORT_LEVEL',
    'CODEX_HOME',
    'GEMINI_CLI_HOME',
    'GEMINI_MODEL',
]
const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-agent-launch-'))
    tempDirs.push(path)
    return path
}

afterEach(() => {
    for (const key of envKeys) delete process.env[key]
    for (const path of tempDirs.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('resolveAgentLaunchConfig', () => {
    it('orders Claude launch options from local runtime environment', async () => {
        process.env.ANTHROPIC_MODEL = 'opus'
        process.env.CLAUDE_CODE_EFFORT_LEVEL = 'xhigh'

        const config = await resolveAgentLaunchConfig('claude', '/repo')

        expect(config.availableModels[0]?.id).toBe('opus')
        expect(config.availableModels[0]?.supportedThinkingLevels[0]).toBe('xhigh')
    })

    it('orders Claude project settings with local precedence', async () => {
        const project = makeTempDir()
        const claudeDir = join(project, '.claude')
        mkdirSync(claudeDir, { recursive: true })
        writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'sonnet', effortLevel: 'low' }))
        writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({ model: 'opus', effortLevel: 'max' }))

        const config = await resolveAgentLaunchConfig('claude', join(project, 'nested'))

        expect(config.availableModels[0]?.id).toBe('opus')
        expect(config.availableModels[0]?.supportedThinkingLevels[0]).toBe('max')
    })

    it('orders Codex model and reasoning from config.toml', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        writeFileSync(join(codexHome, 'config.toml'), 'model = "gpt-5.4"\nmodel_reasoning_effort = "high"\n')

        const config = await resolveAgentLaunchConfig('codex', '/repo')

        expect(config.availableModels[0]).toMatchObject({ id: 'gpt-5.4', label: 'GPT-5.4' })
        expect(config.availableModels[0]?.supportedThinkingLevels[0]).toBe('high')
    })

    it('orders Codex project config from the selected directory', async () => {
        const project = makeTempDir()
        const codexDir = join(project, '.codex')
        mkdirSync(codexDir, { recursive: true })
        writeFileSync(join(codexDir, 'config.toml'), 'model = "gpt-5.5"\nmodel_reasoning_effort = "xhigh"\n')

        const config = await resolveAgentLaunchConfig('codex', join(project, 'packages/app'))

        expect(config.availableModels[0]?.id).toBe('gpt-5.5')
        expect(config.availableModels[0]?.supportedThinkingLevels[0]).toBe('xhigh')
    })

    it('resolves Codex active profile overlays', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        writeFileSync(
            join(codexHome, 'config.toml'),
            'model = "gpt-5.2"\nprofile = "fast"\n[profiles.fast]\nmodel = "gpt-5.4-mini"\nmodel_reasoning_effort = "high"\n'
        )

        const config = await resolveAgentLaunchConfig('codex', '/repo')

        expect(config.availableModels[0]?.id).toBe('gpt-5.4-mini')
        expect(config.availableModels[0]?.supportedThinkingLevels[0]).toBe('high')
    })

    it('orders Gemini model from the same runtime config owner', async () => {
        process.env.GEMINI_MODEL = 'gemini-3-pro-preview'

        const config = await resolveAgentLaunchConfig('gemini', '/repo')

        expect(config.availableModels[0]?.id).toBe('gemini-3-pro-preview')
    })

    it('orders Gemini project settings by directory', async () => {
        process.env.GEMINI_CLI_HOME = makeTempDir()
        const project = makeTempDir()
        const geminiDir = join(project, '.gemini')
        mkdirSync(geminiDir, { recursive: true })
        writeFileSync(join(geminiDir, 'settings.json'), JSON.stringify({ model: { name: 'gemini-2.5-flash' } }))
        writeFileSync(join(project, '.env'), 'GEMINI_API_KEY=test-key\n')

        const config = await resolveAgentLaunchConfig('gemini', join(project, 'src'))

        expect(config.availableModels[0]?.id).toBe('gemini-2.5-flash')
    })

    it('orders Copilot launcher fallback first', async () => {
        const config = await resolveAgentLaunchConfig('copilot', '/repo')

        expect(config.availableModels[0]?.id).toBe('gpt-5')
    })
})
