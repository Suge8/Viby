import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AgentConfigDriver, type AgentConfigVersionState, getAgentConfigSupportedVersion } from '@viby/protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { loadAgentConfigFiles, restoreAgentConfigFile, saveAgentConfigFile } from './agentConfigFiles'

const ORIGINAL_ENV = { ...process.env }
const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-agent-config-'))
    tempDirs.push(path)
    return path
}

function readJson(path: string): Record<string, unknown> {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

function versionState(driver: AgentConfigDriver, status: AgentConfigVersionState['status']): AgentConfigVersionState {
    const requirement = getAgentConfigSupportedVersion(driver)
    return {
        status,
        supportedVersion: requirement.version,
        source: requirement.source,
        installedVersion: status === 'supported' ? requirement.version : '0.0.1',
        checkedAt: 1,
    }
}

const supportedVersion = {
    readVersion: async (driver: AgentConfigDriver) => versionState(driver, 'supported'),
}

afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true })
    }
})

describe('agent config files', () => {
    it('writes Codex config.toml and preserves unknown keys', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        writeFileSync(
            join(codexHome, 'config.toml'),
            '# user note\n[history]\npersistence = "none"\n[custom]\nkeep = true\n'
        )

        const state = await saveAgentConfigFile(
            {
                driver: 'codex',
                values: {
                    'codex.model': 'gpt-5.4',
                    'codex.model_reasoning_effort': 'high',
                    'codex.web_search': 'live',
                    'codex.sandbox_workspace_write.writable_roots': ['/tmp/viby-work'],
                    'codex.sandbox_workspace_write.network_access': true,
                    'codex.history.persistence': 'save-all',
                },
            },
            supportedVersion
        )

        const raw = readFileSync(join(codexHome, 'config.toml'), 'utf-8')
        expect(raw).toContain('# user note')
        expect(raw).toContain('model = "gpt-5.4"')
        expect(raw).toContain('model_reasoning_effort = "high"')
        expect(raw).toContain('web_search = "live"')
        expect(raw).toContain('[sandbox_workspace_write]')
        expect(raw).toContain('writable_roots = ["/tmp/viby-work"]')
        expect(raw).toContain('network_access = true')
        expect(raw).toContain('[custom]\nkeep = true')
        expect(state.values['codex.history.persistence']).toBe('save-all')
    })

    it('writes Claude settings.json with safe permission mappings', async () => {
        const claudeHome = makeTempDir()
        process.env.CLAUDE_CONFIG_DIR = claudeHome
        mkdirSync(claudeHome, { recursive: true })
        writeFileSync(
            join(claudeHome, 'settings.json'),
            JSON.stringify({ custom: true, permissions: { deny: ['Read(./private)'] } })
        )

        const state = await saveAgentConfigFile(
            {
                driver: 'claude',
                values: {
                    'claude.model': 'sonnet',
                    'claude.permissions.disableBypassPermissionsMode': true,
                    'claude.permissions.denySensitiveFiles': true,
                    'claude.includeCoAuthoredBy': false,
                },
            },
            supportedVersion
        )

        const settings = readJson(join(claudeHome, 'settings.json'))
        expect(settings.custom).toBe(true)
        expect(settings.model).toBe('sonnet')
        expect(settings.includeCoAuthoredBy).toBe(false)
        expect((settings.permissions as Record<string, unknown>).disableBypassPermissionsMode).toBe('disable')
        expect((settings.permissions as Record<string, unknown>).deny).toEqual(
            expect.arrayContaining(['Read(./private)', 'Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)'])
        )
        expect(state.values['claude.permissions.disableBypassPermissionsMode']).toBe(true)
    })

    it('writes Gemini, Pi, and Copilot JSON settings in their configured roots', async () => {
        const geminiRoot = makeTempDir()
        const piRoot = makeTempDir()
        const copilotHome = makeTempDir()
        process.env.GEMINI_CLI_HOME = geminiRoot
        process.env.PI_CODING_AGENT_DIR = piRoot
        process.env.COPILOT_HOME = copilotHome

        await saveAgentConfigFile(
            { driver: 'gemini', values: { 'gemini.model.name': 'gemini-2.5-flash' } },
            supportedVersion
        )
        await saveAgentConfigFile(
            {
                driver: 'pi',
                values: { 'pi.defaultModel': 'openai/gpt-5.4', 'pi.quietStartup': true },
            },
            supportedVersion
        )
        await saveAgentConfigFile(
            {
                driver: 'copilot',
                values: { 'copilot.model': 'gpt-5.4', 'copilot.streamerMode': true },
            },
            supportedVersion
        )

        expect(readJson(join(geminiRoot, '.gemini', 'settings.json')).model).toEqual({ name: 'gemini-2.5-flash' })
        expect(readJson(join(piRoot, 'settings.json')).defaultModel).toBe('openai/gpt-5.4')
        expect(readJson(join(copilotHome, 'settings.json')).streamerMode).toBe(true)

        const response = await loadAgentConfigFiles(supportedVersion)
        expect(response.agents).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ driver: 'gemini', exists: true }),
                expect.objectContaining({ driver: 'pi', exists: true }),
                expect.objectContaining({ driver: 'copilot', exists: true }),
            ])
        )
        expect(existsSync(join(geminiRoot, '.gemini', 'settings.json'))).toBe(true)
    })

    it('loads defaults and parse errors without throwing across every driver', async () => {
        const codexHome = makeTempDir()
        const claudeHome = makeTempDir()
        const geminiRoot = makeTempDir()
        process.env.CODEX_HOME = codexHome
        process.env.CLAUDE_CONFIG_DIR = claudeHome
        process.env.GEMINI_CLI_HOME = geminiRoot
        mkdirSync(claudeHome, { recursive: true })
        writeFileSync(join(claudeHome, 'settings.json'), '{not json')

        const response = await loadAgentConfigFiles(supportedVersion)
        const codex = response.agents.find((agent) => agent.driver === 'codex')
        const claude = response.agents.find((agent) => agent.driver === 'claude')
        const gemini = response.agents.find((agent) => agent.driver === 'gemini')

        expect(codex?.exists).toBe(false)
        expect(codex?.values['codex.history.persistence']).toBeNull()
        expect(claude?.exists).toBe(true)
        expect(claude?.error).toContain('JSON')
        expect(claude?.values['claude.model']).toBeNull()
        expect(gemini?.path).toBe(join(geminiRoot, '.gemini', 'settings.json'))
    })

    it('rejects invalid save requests before touching disk', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        mkdirSync(codexHome, { recursive: true })
        const configPath = join(codexHome, 'config.toml')
        writeFileSync(configPath, 'model = "before"\n')

        await expect(
            saveAgentConfigFile(
                {
                    driver: 'codex',
                    values: { 'codex.model': { nested: true } as never },
                },
                supportedVersion
            )
        ).rejects.toThrow()

        expect(readFileSync(configPath, 'utf-8')).toBe('model = "before"\n')
    })

    it('creates backups, restores them, and detects external edits', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        mkdirSync(codexHome, { recursive: true })
        const configPath = join(codexHome, 'config.toml')
        writeFileSync(configPath, 'model = "before"\n')

        const loaded = (await loadAgentConfigFiles(supportedVersion)).agents.find((agent) => agent.driver === 'codex')
        const saved = await saveAgentConfigFile(
            {
                driver: 'codex',
                values: { 'codex.model': 'after' },
                expectedExists: true,
                expectedStamp: loaded?.stamp,
            },
            supportedVersion
        )

        expect(readFileSync(configPath, 'utf-8')).toContain('model = "after"')
        expect(saved.backups?.length).toBe(1)

        writeFileSync(configPath, 'model = "external"\n')
        await expect(
            saveAgentConfigFile(
                {
                    driver: 'codex',
                    values: { 'codex.model': 'blocked' },
                    expectedExists: true,
                    expectedStamp: saved.stamp,
                },
                supportedVersion
            )
        ).rejects.toThrow('Config changed on disk')

        await restoreAgentConfigFile({ driver: 'codex', backupPath: saved.backups?.[0]?.path ?? '' }, supportedVersion)
        expect(readFileSync(configPath, 'utf-8')).toContain('model = "before"')
    })

    it('detects a file created after a missing-file load', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        mkdirSync(codexHome, { recursive: true })
        writeFileSync(join(codexHome, 'config.toml'), 'model = "external"\n')

        await expect(
            saveAgentConfigFile(
                {
                    driver: 'codex',
                    values: { 'codex.model': 'blocked' },
                    expectedExists: false,
                },
                supportedVersion
            )
        ).rejects.toThrow('Config changed on disk')
    })

    it('blocks writes when the installed agent version is not the supported latest version', async () => {
        const codexHome = makeTempDir()
        process.env.CODEX_HOME = codexHome
        mkdirSync(codexHome, { recursive: true })
        const configPath = join(codexHome, 'config.toml')
        writeFileSync(configPath, 'model = "before"\n')

        await expect(
            saveAgentConfigFile(
                { driver: 'codex', values: { 'codex.model': 'after' } },
                { readVersion: async (driver) => versionState(driver, 'unsupported') }
            )
        ).rejects.toThrow('Unsupported codex version')

        expect(readFileSync(configPath, 'utf-8')).toBe('model = "before"\n')
    })
})
