import { describe, expect, it } from 'vitest'
import {
    AGENT_CONFIG_DRIVERS,
    AGENT_CONFIG_FIELDS,
    AGENT_CONFIG_SUPPORTED_VERSIONS,
    type AgentConfigDriver,
    AgentConfigFieldDefinitionSchema,
    AgentConfigFieldValueSchema,
    AgentConfigResponseSchema,
    AgentConfigVersionStateSchema,
    compareAgentConfigVersions,
    createAgentConfigValuePatch,
    getAgentConfigFields,
    isAgentConfigVersionSupported,
    normalizeAgentConfigVersion,
    RestoreAgentConfigRequestSchema,
    RestoreAgentConfigResponseSchema,
    SaveAgentConfigRequestSchema,
    SaveAgentConfigResponseSchema,
} from './agentConfig'

const REQUIRED_FIELD_CONTRACTS = {
    codex: {
        'codex.model': { control: 'select', path: 'model', group: 'model' },
        'codex.approval_policy': { control: 'select', path: 'approval_policy', group: 'safety' },
        'codex.sandbox_workspace_write.network_access': {
            control: 'toggle',
            path: 'sandbox_workspace_write.network_access',
            group: 'safety',
            defaultValue: false,
        },
        'codex.web_search': { control: 'select', path: 'web_search', group: 'tools', defaultValue: 'cached' },
        'codex.sandbox_workspace_write.writable_roots': {
            control: 'list',
            path: 'sandbox_workspace_write.writable_roots',
            group: 'safety',
        },
    },
    claude: {
        'claude.model': { control: 'select', path: 'model', group: 'model' },
        'claude.permissions.defaultMode': { control: 'select', path: 'permissions.defaultMode', group: 'safety' },
        'claude.permissions.disableBypassPermissionsMode': {
            control: 'toggle',
            path: 'permissions.disableBypassPermissionsMode',
            group: 'safety',
        },
        'claude.permissions.denySensitiveFiles': { control: 'toggle', path: 'permissions.deny', group: 'safety' },
        'claude.includeCoAuthoredBy': {
            control: 'toggle',
            path: 'includeCoAuthoredBy',
            group: 'git',
            defaultValue: true,
        },
    },
    gemini: {
        'gemini.model.name': { control: 'select', path: 'model.name', group: 'model' },
        'gemini.tools.sandboxNetworkAccess': {
            control: 'toggle',
            path: 'tools.sandboxNetworkAccess',
            group: 'safety',
            defaultValue: false,
        },
        'gemini.general.plan.enabled': {
            control: 'toggle',
            path: 'general.plan.enabled',
            group: 'planning',
            defaultValue: true,
        },
        'gemini.context.fileFiltering.respectGitIgnore': {
            control: 'toggle',
            path: 'context.fileFiltering.respectGitIgnore',
            group: 'tools',
            defaultValue: true,
        },
    },
    pi: {
        'pi.defaultProvider': { control: 'select', path: 'defaultProvider', group: 'model' },
        'pi.defaultModel': { control: 'text', path: 'defaultModel', group: 'model' },
        'pi.enabledModels': { control: 'list', path: 'enabledModels', group: 'model' },
        'pi.theme': { control: 'select', path: 'theme', group: 'ui', defaultValue: 'dark' },
        'pi.quietStartup': { control: 'toggle', path: 'quietStartup', group: 'ui', defaultValue: false },
    },
    copilot: {
        'copilot.model': { control: 'select', path: 'model', group: 'model' },
        'copilot.effortLevel': { control: 'select', path: 'effortLevel', group: 'model', defaultValue: 'medium' },
        'copilot.allowedUrls': { control: 'list', path: 'allowedUrls', group: 'safety' },
        'copilot.streamerMode': { control: 'toggle', path: 'streamerMode', group: 'privacy', defaultValue: false },
        'copilot.keepAlive': { control: 'select', path: 'keepAlive', group: 'runtime', defaultValue: 'off' },
    },
} as const

function fieldMap(driver: AgentConfigDriver) {
    return new Map(getAgentConfigFields(driver).map((field) => [field.id, field]))
}

describe('agent config catalog', () => {
    it('keeps valid unique field definitions for every writable driver', () => {
        const ids = new Set<string>()
        for (const field of AGENT_CONFIG_FIELDS) {
            expect(() => AgentConfigFieldDefinitionSchema.parse(field)).not.toThrow()
            expect(ids.has(field.id)).toBe(false)
            ids.add(field.id)
            expect(field.id.startsWith(`${field.driver}.`)).toBe(true)
        }

        for (const driver of AGENT_CONFIG_DRIVERS) {
            expect(getAgentConfigFields(driver).length).toBeGreaterThan(0)
        }
    })

    it('keeps every option and default value compatible with its control type', () => {
        for (const field of AGENT_CONFIG_FIELDS) {
            if (field.control === 'select') {
                expect(field.options?.length).toBeGreaterThan(0)
                const optionValues = new Set(field.options?.map((option) => option.value))
                if (typeof field.defaultValue === 'string') {
                    expect(optionValues.has(field.defaultValue)).toBe(true)
                }
            }

            if (field.control === 'toggle') {
                expect(field.defaultValue === undefined || typeof field.defaultValue === 'boolean').toBe(true)
            }

            if (field.control === 'number') {
                expect(field.defaultValue === undefined || typeof field.defaultValue === 'number').toBe(true)
            }

            if (field.control === 'list') {
                expect(field.defaultValue === undefined || Array.isArray(field.defaultValue)).toBe(true)
            }
        }
    })

    it('keeps persisted values narrow enough for config files and peer RPC', () => {
        expect(AgentConfigFieldValueSchema.safeParse('gpt-5.4').success).toBe(true)
        expect(AgentConfigFieldValueSchema.safeParse(true).success).toBe(true)
        expect(AgentConfigFieldValueSchema.safeParse(4).success).toBe(true)
        expect(AgentConfigFieldValueSchema.safeParse(['Read(./.env)']).success).toBe(true)
        expect(AgentConfigFieldValueSchema.safeParse(null).success).toBe(true)

        expect(AgentConfigFieldValueSchema.safeParse({ value: 'gpt-5.4' }).success).toBe(false)
        expect(AgentConfigFieldValueSchema.safeParse([{ nested: true }]).success).toBe(false)
    })

    it('parses the load and save contracts without accepting unknown drivers', () => {
        const response = AgentConfigResponseSchema.parse({
            agents: [
                {
                    driver: 'codex',
                    path: '/home/user/.codex/config.toml',
                    exists: true,
                    values: {
                        'codex.model': 'gpt-5.4',
                        'codex.sandbox_workspace_write.network_access': true,
                    },
                    stamp: { mtimeMs: 1, size: 10, sha256: 'abc' },
                    backups: [{ path: '/home/user/.codex/.viby-backups/config.toml.bak', createdAt: 1 }],
                    version: {
                        status: 'supported',
                        supportedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                        source: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.source,
                        installedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                        command: 'codex --version',
                        checkedAt: 1,
                    },
                },
            ],
        })

        expect(response.agents[0]?.driver).toBe('codex')
        expect(response.agents[0]?.stamp?.sha256).toBe('abc')
        expect(
            SaveAgentConfigRequestSchema.parse({
                driver: 'claude',
                values: {
                    'claude.model': 'sonnet',
                    'claude.permissions.denySensitiveFiles': true,
                },
                expectedExists: true,
                expectedStamp: { mtimeMs: 1, size: 20, sha256: 'def' },
            }).driver
        ).toBe('claude')

        expect(
            SaveAgentConfigResponseSchema.parse({
                agent: {
                    driver: 'gemini',
                    path: '/home/user/.gemini/settings.json',
                    exists: true,
                    values: { 'gemini.model.name': 'gemini-2.5-flash' },
                    version: {
                        status: 'supported',
                        supportedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.gemini.version,
                        source: AGENT_CONFIG_SUPPORTED_VERSIONS.gemini.source,
                        installedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.gemini.version,
                        checkedAt: 1,
                    },
                },
            }).agent.exists
        ).toBe(true)
        expect(
            RestoreAgentConfigRequestSchema.parse({
                driver: 'codex',
                backupPath: '/home/user/.codex/.viby-backups/config.toml.bak',
            }).driver
        ).toBe('codex')
        expect(
            RestoreAgentConfigResponseSchema.parse({
                agent: {
                    driver: 'codex',
                    path: '/home/user/.codex/config.toml',
                    exists: true,
                    values: {},
                    version: {
                        status: 'supported',
                        supportedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                        source: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.source,
                        installedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                        checkedAt: 1,
                    },
                },
            }).agent.driver
        ).toBe('codex')
        expect(() => SaveAgentConfigRequestSchema.parse({ driver: 'unknown', values: {} })).toThrow()
    })

    it('keeps minimum verified versions as the config write floor', () => {
        expect(Object.keys(AGENT_CONFIG_SUPPORTED_VERSIONS).sort()).toEqual([...AGENT_CONFIG_DRIVERS].sort())
        for (const driver of AGENT_CONFIG_DRIVERS) {
            const requirement = AGENT_CONFIG_SUPPORTED_VERSIONS[driver]
            expect(requirement.version).toMatch(/^\d+\.\d+\.\d+/)
            expect(requirement.source).not.toBe('')
            expect(isAgentConfigVersionSupported(driver, requirement.version)).toBe(true)
            const [major, minor, patch] = requirement.version.split('.').map(Number)
            expect(isAgentConfigVersionSupported(driver, `${major}.${minor}.${patch + 1}`)).toBe(true)
            expect(isAgentConfigVersionSupported(driver, '0.0.1')).toBe(false)
            expect(normalizeAgentConfigVersion(`v${requirement.version}`)).toBe(requirement.version)
            expect(() =>
                AgentConfigVersionStateSchema.parse({
                    status: 'supported',
                    supportedVersion: requirement.version,
                    source: requirement.source,
                    installedVersion: requirement.version,
                    checkedAt: 1,
                })
            ).not.toThrow()
        }
    })

    it('compares provider CLI versions without blocking newer releases', () => {
        expect(compareAgentConfigVersions('0.131.0', '0.130.0')).toBe(1)
        expect(compareAgentConfigVersions('0.130.0', '0.130.0')).toBe(0)
        expect(compareAgentConfigVersions('0.129.9', '0.130.0')).toBe(-1)
        expect(compareAgentConfigVersions('0.130.0-beta.1', '0.130.0')).toBe(-1)
        expect(compareAgentConfigVersions('not-a-version', '0.130.0')).toBeNull()
    })

    it('keeps driver field groups stable enough for dense configuration screens', () => {
        for (const driver of AGENT_CONFIG_DRIVERS) {
            const fields = getAgentConfigFields(driver)
            const groups = new Map<string, number>()
            for (const field of fields) {
                groups.set(field.group, (groups.get(field.group) ?? 0) + 1)
                expect(field.path.includes('..')).toBe(false)
                expect(field.label.en.trim()).not.toBe('')
                expect(field.label.zh.trim()).not.toBe('')
                expect(field.help.en.trim()).not.toBe('')
                expect(field.help.zh.trim()).not.toBe('')
            }

            expect(groups.size).toBeGreaterThanOrEqual(1)
            expect([...groups.values()].every((count) => count > 0)).toBe(true)
        }
    })

    it('keeps critical persisted paths stable for every supported agent', () => {
        for (const driver of AGENT_CONFIG_DRIVERS) {
            const fields = fieldMap(driver)
            for (const [id, contract] of Object.entries(REQUIRED_FIELD_CONTRACTS[driver])) {
                const field = fields.get(id)
                expect(field).toBeDefined()
                expect(field).toMatchObject({ driver, ...contract })
            }
        }
    })

    it('keeps select controls deterministic and safe for settings files', () => {
        for (const field of AGENT_CONFIG_FIELDS.filter((field) => field.control === 'select')) {
            const optionValues = field.options?.map((option) => option.value) ?? []
            expect(optionValues.length).toBeGreaterThan(0)
            expect(new Set(optionValues).size).toBe(optionValues.length)
            expect(optionValues.every((value) => value.trim() === value && value.length > 0)).toBe(true)
            expect(field.defaultValue === undefined || optionValues.includes(String(field.defaultValue))).toBe(true)
        }
    })

    it('keeps field ids and paths scoped to a single driver owner', () => {
        for (const driver of AGENT_CONFIG_DRIVERS) {
            const fields = getAgentConfigFields(driver)
            const paths = new Map<string, string>()
            for (const field of fields) {
                expect(field.driver).toBe(driver)
                expect(field.id.startsWith(`${driver}.`)).toBe(true)
                expect(field.path.startsWith(`${driver}.`)).toBe(false)
                const existing = paths.get(field.path)
                expect(existing ?? field.id).toBe(field.id)
                paths.set(field.path, field.id)
            }
        }
    })

    it('builds minimal save patches without writing unchanged defaults', () => {
        const fields = getAgentConfigFields('codex')
        const patch = createAgentConfigValuePatch(
            fields,
            {
                'codex.model': 'gpt-5.5',
                'codex.web_search': 'cached',
                'codex.sandbox_workspace_write.network_access': false,
            },
            {
                'codex.model': 'gpt-5.4',
            }
        )

        expect(patch).toEqual({ 'codex.model': 'gpt-5.5' })
    })

    it('keeps safety and tool controls present for mobile configuration UX', () => {
        for (const driver of AGENT_CONFIG_DRIVERS) {
            const fields = getAgentConfigFields(driver)
            const groups = new Set(fields.map((field) => field.group))
            const hasNonModelControl = fields.some(
                (field) => field.group === 'runtime' || field.group === 'tools' || field.group === 'model'
            )

            expect(groups.has('model')).toBe(true)
            expect(hasNonModelControl).toBe(true)
        }
    })

    it('rejects malformed file states before desktop or mobile renders them', () => {
        const validState = {
            driver: 'codex',
            path: '/home/user/.codex/config.toml',
            exists: true,
            values: {
                'codex.model': 'gpt-5.4',
                'codex.web_search': 'cached',
                'codex.sandbox_workspace_write.writable_roots': ['/tmp/work'],
                'codex.history.persistence': null,
            },
            version: {
                status: 'supported',
                supportedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                source: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.source,
                installedVersion: AGENT_CONFIG_SUPPORTED_VERSIONS.codex.version,
                checkedAt: 1,
            },
        }

        expect(AgentConfigResponseSchema.parse({ agents: [validState] }).agents[0]?.values).toEqual(validState.values)
        expect(() => AgentConfigResponseSchema.parse({ agents: [{ ...validState, path: '' }] })).toThrow()
        expect(() => AgentConfigResponseSchema.parse({ agents: [{ ...validState, exists: 'yes' }] })).toThrow()
        expect(() =>
            AgentConfigResponseSchema.parse({
                agents: [{ ...validState, values: { 'codex.web_search': { mode: 'cached' } } }],
            })
        ).toThrow()
        expect(() =>
            SaveAgentConfigResponseSchema.parse({
                agent: { ...validState, driver: 'unknown' },
            })
        ).toThrow()
    })
})
