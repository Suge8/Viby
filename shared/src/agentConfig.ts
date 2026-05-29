import { z } from 'zod'

export const AGENT_CONFIG_DRIVERS = ['codex', 'claude', 'gemini', 'pi', 'copilot'] as const
export const AGENT_CONFIG_CONTROLS = ['select', 'toggle', 'text', 'number', 'list'] as const
export const AGENT_CONFIG_VERSION_STATUSES = ['supported', 'outdated', 'missing', 'unknown'] as const

export const AGENT_CONFIG_SUPPORTED_VERSIONS = {
    codex: {
        version: '0.130.0',
        source: 'npm:@openai/codex minimum verified version; newer versions use the stable baseline catalog',
    },
    claude: {
        version: '2.1.143',
        source: 'npm:@anthropic-ai/claude-code minimum verified version; newer versions use the stable baseline catalog',
    },
    gemini: {
        version: '0.42.0',
        source: 'npm:@google/gemini-cli minimum verified version; newer versions use the stable baseline catalog',
    },
    pi: {
        version: '0.75.1',
        source: 'github:earendil-works/pi minimum verified version; newer versions use the stable baseline catalog',
    },
    copilot: {
        version: '1.0.48',
        source: 'github:github/copilot-cli minimum verified version; newer versions use the stable baseline catalog',
    },
} as const satisfies Record<AgentConfigDriver, { version: string; source: string }>

export const AgentConfigDriverSchema = z.enum(AGENT_CONFIG_DRIVERS)
export const AgentConfigControlSchema = z.enum(AGENT_CONFIG_CONTROLS)
export const AgentConfigVersionStatusSchema = z.enum(AGENT_CONFIG_VERSION_STATUSES)
export const AgentConfigFieldValueSchema = z.union([z.string(), z.boolean(), z.number(), z.array(z.string()), z.null()])

const AgentConfigTextSchema = z.object({ en: z.string(), zh: z.string() })
const AgentConfigOptionSchema = z.object({
    value: z.string(),
    label: AgentConfigTextSchema,
})

export const AgentConfigFieldDefinitionSchema = z.object({
    id: z.string().min(1),
    driver: AgentConfigDriverSchema,
    group: z.string().min(1),
    path: z.string().min(1),
    control: AgentConfigControlSchema,
    label: AgentConfigTextSchema,
    help: AgentConfigTextSchema,
    defaultValue: AgentConfigFieldValueSchema.optional(),
    options: z.array(AgentConfigOptionSchema).optional(),
    sensitive: z.boolean().optional(),
})

export const AgentConfigFileStampSchema = z.object({
    mtimeMs: z.number(),
    size: z.number(),
    sha256: z.string().min(1),
})

export const AgentConfigBackupSchema = z.object({
    path: z.string().min(1),
    createdAt: z.number(),
})

export const AgentConfigVersionStateSchema = z.object({
    status: AgentConfigVersionStatusSchema,
    supportedVersion: z.string().min(1),
    source: z.string().min(1),
    installedVersion: z.string().optional(),
    command: z.string().optional(),
    checkedAt: z.number(),
})

export const AgentConfigFileStateSchema = z.object({
    driver: AgentConfigDriverSchema,
    path: z.string().min(1),
    exists: z.boolean(),
    values: z.record(z.string(), AgentConfigFieldValueSchema),
    version: AgentConfigVersionStateSchema,
    stamp: AgentConfigFileStampSchema.optional(),
    backups: z.array(AgentConfigBackupSchema).optional(),
    error: z.string().optional(),
})

export const AgentConfigResponseSchema = z.object({
    agents: z.array(AgentConfigFileStateSchema),
})

export const SaveAgentConfigRequestSchema = z.object({
    driver: AgentConfigDriverSchema,
    values: z.record(z.string(), AgentConfigFieldValueSchema),
    expectedExists: z.boolean().optional(),
    expectedStamp: AgentConfigFileStampSchema.optional(),
})

export const SaveAgentConfigResponseSchema = z.object({
    agent: AgentConfigFileStateSchema,
})

export const RestoreAgentConfigRequestSchema = z.object({
    driver: AgentConfigDriverSchema,
    backupPath: z.string().min(1),
})

export const RestoreAgentConfigResponseSchema = z.object({
    agent: AgentConfigFileStateSchema,
})

export const OpenAgentConfigRequestSchema = z.object({
    driver: AgentConfigDriverSchema,
})

export const OpenAgentConfigResponseSchema = z.object({
    ok: z.literal(true),
    path: z.string().min(1),
})

export type AgentConfigDriver = z.infer<typeof AgentConfigDriverSchema>
export type AgentConfigControl = z.infer<typeof AgentConfigControlSchema>
export type AgentConfigVersionStatus = z.infer<typeof AgentConfigVersionStatusSchema>
export type AgentConfigFieldValue = z.infer<typeof AgentConfigFieldValueSchema>
export type AgentConfigFieldDefinition = z.infer<typeof AgentConfigFieldDefinitionSchema>
export type AgentConfigFileStamp = z.infer<typeof AgentConfigFileStampSchema>
export type AgentConfigBackup = z.infer<typeof AgentConfigBackupSchema>
export type AgentConfigVersionState = z.infer<typeof AgentConfigVersionStateSchema>
export type AgentConfigFileState = z.infer<typeof AgentConfigFileStateSchema>
export type AgentConfigResponse = z.infer<typeof AgentConfigResponseSchema>
export type SaveAgentConfigRequest = z.infer<typeof SaveAgentConfigRequestSchema>
export type SaveAgentConfigResponse = z.infer<typeof SaveAgentConfigResponseSchema>
export type RestoreAgentConfigRequest = z.infer<typeof RestoreAgentConfigRequestSchema>
export type RestoreAgentConfigResponse = z.infer<typeof RestoreAgentConfigResponseSchema>
export type OpenAgentConfigRequest = z.infer<typeof OpenAgentConfigRequestSchema>
export type OpenAgentConfigResponse = z.infer<typeof OpenAgentConfigResponseSchema>

export function areAgentConfigValuesEqual(left: AgentConfigFieldValue, right: AgentConfigFieldValue): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
}

export function getAgentConfigSupportedVersion(
    driver: AgentConfigDriver
): (typeof AGENT_CONFIG_SUPPORTED_VERSIONS)[AgentConfigDriver] {
    return AGENT_CONFIG_SUPPORTED_VERSIONS[driver]
}

export function normalizeAgentConfigVersion(version: string): string {
    return version.trim().replace(/^v/i, '')
}

export function parseAgentConfigVersionOutput(output: string): string | undefined {
    return output.match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1]
}

function parseAgentConfigVersionCore(version: string): { major: number; minor: number; patch: number } | null {
    const match = normalizeAgentConfigVersion(version).match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!match) return null
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    }
}

function isPrerelease(version: string): boolean {
    return /^\d+\.\d+\.\d+-/.test(normalizeAgentConfigVersion(version))
}

export function compareAgentConfigVersions(left: string, right: string): number | null {
    const leftCore = parseAgentConfigVersionCore(left)
    const rightCore = parseAgentConfigVersionCore(right)
    if (!leftCore || !rightCore) return null

    for (const key of ['major', 'minor', 'patch'] as const) {
        const delta = leftCore[key] - rightCore[key]
        if (delta !== 0) return delta > 0 ? 1 : -1
    }

    if (isPrerelease(left) && !isPrerelease(right)) return -1
    if (!isPrerelease(left) && isPrerelease(right)) return 1
    return 0
}

export function isAgentConfigVersionSupported(driver: AgentConfigDriver, version: string | undefined): boolean {
    if (!version) return false
    const minimumVersion = getAgentConfigSupportedVersion(driver).version
    const comparison = compareAgentConfigVersions(version, minimumVersion)
    return comparison !== null && comparison >= 0
}

export function createAgentConfigValuePatch(
    fields: readonly AgentConfigFieldDefinition[],
    draft: Record<string, AgentConfigFieldValue>,
    saved: Record<string, AgentConfigFieldValue> | undefined
): Record<string, AgentConfigFieldValue> {
    const patch: Record<string, AgentConfigFieldValue> = {}
    for (const field of fields) {
        const currentValue = draft[field.id] ?? field.defaultValue ?? null
        const savedValue = saved?.[field.id] ?? field.defaultValue ?? null
        if (!areAgentConfigValuesEqual(currentValue, savedValue)) patch[field.id] = currentValue
    }
    return patch
}

export { AGENT_CONFIG_FIELDS, getAgentConfigFields } from './agentConfigCatalog'
