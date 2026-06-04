import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveAgentLaunchConfig } from './agentLaunchConfig'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-agent-launch-'))
    tempDirs.push(path)
    return path
}

afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true })
    }
})

describe('resolveAgentLaunchConfig', () => {
    it('resolves Claude model from local runtime environment', async () => {
        process.env.ANTHROPIC_MODEL = 'opus'
        process.env.CLAUDE_CODE_EFFORT_LEVEL = 'xhigh'

        await expect(resolveAgentLaunchConfig('claude', '/repo')).resolves.toMatchObject({
            agent: 'claude',
            defaultModel: 'opus',
            defaultModelReasoningEffort: 'xhigh',
        })
    })

    it('resolves Claude project settings with local precedence', async () => {
        const project = makeTempDir()
        const claudeDir = join(project, '.claude')
        mkdirSync(claudeDir, { recursive: true })
        writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({ model: 'sonnet', effortLevel: 'low' }))
        writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify({ model: 'opus', effortLevel: 'max' }))

        await expect(resolveAgentLaunchConfig('claude', join(project, 'nested'))).resolves.toMatchObject({
            agent: 'claude',
            defaultModel: 'opus',
            defaultModelReasoningEffort: 'max',
        })
    })

    it('resolves Codex model and reasoning from config.toml', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        writeFileSync(join(codexHome, 'config.toml'), 'model = "gpt-5.4"\nmodel_reasoning_effort = "high"\n')

        await expect(resolveAgentLaunchConfig('codex', '/repo')).resolves.toMatchObject({
            agent: 'codex',
            defaultModel: 'gpt-5.4',
            defaultModelReasoningEffort: 'high',
            availableModels: expect.arrayContaining([expect.objectContaining({ id: 'gpt-5.4', label: 'GPT-5.4' })]),
        })
    })

    it('resolves Codex project config from the selected directory', async () => {
        const project = makeTempDir()
        const codexDir = join(project, '.codex')
        mkdirSync(codexDir, { recursive: true })
        writeFileSync(join(codexDir, 'config.toml'), 'model = "gpt-5.5"\nmodel_reasoning_effort = "xhigh"\n')

        await expect(resolveAgentLaunchConfig('codex', join(project, 'packages/app'))).resolves.toMatchObject({
            agent: 'codex',
            defaultModel: 'gpt-5.5',
            defaultModelReasoningEffort: 'xhigh',
        })
    })

    it('resolves Codex active profile overlays', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        writeFileSync(
            join(codexHome, 'config.toml'),
            'model = "gpt-5.2"\nprofile = "fast"\n[profiles.fast]\nmodel = "gpt-5.4-mini"\nmodel_reasoning_effort = "high"\n'
        )

        await expect(resolveAgentLaunchConfig('codex', '/repo')).resolves.toMatchObject({
            agent: 'codex',
            defaultModel: 'gpt-5.4-mini',
            defaultModelReasoningEffort: 'high',
        })
    })

    it('resolves Gemini model from the same runtime config owner', async () => {
        process.env.GEMINI_MODEL = 'gemini-3-pro-preview'

        await expect(resolveAgentLaunchConfig('gemini', '/repo')).resolves.toMatchObject({
            agent: 'gemini',
            defaultModel: 'gemini-3-pro-preview',
            defaultModelReasoningEffort: null,
        })
    })

    it('resolves Gemini project settings by directory', async () => {
        process.env.GEMINI_CLI_HOME = makeTempDir()
        const project = makeTempDir()
        const geminiDir = join(project, '.gemini')
        mkdirSync(geminiDir, { recursive: true })
        writeFileSync(join(geminiDir, 'settings.json'), JSON.stringify({ model: { name: 'gemini-2.5-flash' } }))
        writeFileSync(join(project, '.env'), 'GEMINI_API_KEY=test-key\n')

        await expect(resolveAgentLaunchConfig('gemini', join(project, 'src'))).resolves.toMatchObject({
            agent: 'gemini',
            defaultModel: 'gemini-2.5-flash',
            defaultModelReasoningEffort: null,
        })
    })

    it('exposes Copilot launcher fallback as the resolved default model', async () => {
        await expect(resolveAgentLaunchConfig('copilot', '/repo')).resolves.toMatchObject({
            agent: 'copilot',
            defaultModel: 'gpt-5',
            defaultModelReasoningEffort: null,
        })
    })
})
