import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import {
    type AgentFlavor,
    type AgentLaunchConfig,
    type AgentLaunchConfigErrorCode,
    type AgentModelCapability,
    CLAUDE_REASONING_EFFORTS,
    CODEX_MODEL_LABELS,
    CODEX_REASONING_EFFORTS,
    COPILOT_MODEL_LABELS,
    getClaudeModelLabel,
    getGeminiModelLabel,
    type ModelReasoningEffort,
} from '@viby/protocol'
import { COPILOT_DEFAULT_MODEL } from '@/copilot/copilotModel'
import { resolveGeminiRuntimeConfig } from '@/gemini/utils/config'
import { resolvePiAgentLaunchConfig } from '@/pi/launchConfig'
import { logger } from '@/ui/logger'

const CODEX_CONFIG_FILE = 'config.toml'
const CLAUDE_MODEL_ENV_KEYS = ['ANTHROPIC_MODEL', 'CLAUDE_MODEL'] as const
const CLAUDE_REASONING_ENV_KEYS = ['CLAUDE_CODE_EFFORT_LEVEL'] as const
const VALID_REASONING_EFFORTS = new Set<ModelReasoningEffort>([
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
])

function readJsonFile(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null
    } catch (error) {
        logger.debug(`[agent-launch-config] Failed to read JSON ${path}: ${error}`)
        return null
    }
}

function getTomlParser(): { parse: (raw: string) => unknown } {
    return (
        (globalThis as { Bun?: { TOML?: { parse: (raw: string) => unknown } } }).Bun?.TOML ?? { parse: parseFlatToml }
    )
}

function parseFlatToml(raw: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex < 1) continue

        const key = trimmed.slice(0, separatorIndex).trim()
        const value = trimmed.slice(separatorIndex + 1).trim()
        result[key] = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
    }
    return result
}

function readTomlFile(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null

    try {
        const parsed = getTomlParser().parse(readFileSync(path, 'utf-8'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null
    } catch (error) {
        logger.debug(`[agent-launch-config] Failed to read TOML ${path}: ${error}`)
        return null
    }
}

function mergeRecords(...records: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
    return Object.assign({}, ...records.filter(Boolean))
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(record: Record<string, unknown> | null | undefined, keys: readonly string[]): string | null {
    if (!record) return null

    for (const key of keys) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
}

function readEnv(keys: readonly string[]): string | null {
    for (const key of keys) {
        const value = process.env[key]?.trim()
        if (value) return value
    }
    return null
}

function findNearestConfigFile(directory: string, relativePath: string): string | null {
    let current = resolve(directory)
    const root = parse(current).root
    while (true) {
        const candidate = join(current, relativePath)
        if (existsSync(candidate)) return candidate
        if (current === root) return null
        current = dirname(current)
    }
}

function normalizeReasoningEffort(value: string | null): ModelReasoningEffort | null {
    return value && VALID_REASONING_EFFORTS.has(value as ModelReasoningEffort) ? (value as ModelReasoningEffort) : null
}

function normalizeModelIds(models: readonly string[]): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []
    for (const model of models) {
        const id = model.trim()
        if (!id || id === 'auto' || id === 'default' || seen.has(id)) continue
        seen.add(id)
        normalized.push(id)
    }
    return normalized
}

function preferFirst<T extends string | null>(preferred: T, values: readonly string[]): string[] {
    const normalized = normalizeModelIds(preferred ? [preferred, ...values] : values)
    return normalized
}

function orderReasoning(
    preferred: ModelReasoningEffort | null,
    supportedThinkingLevels: readonly ModelReasoningEffort[]
): ModelReasoningEffort[] {
    if (!preferred) return [...supportedThinkingLevels]
    return [...new Set([preferred, ...supportedThinkingLevels])].filter((effort) =>
        supportedThinkingLevels.includes(effort)
    )
}

function createCapabilities(
    models: readonly string[],
    getLabel: (model: string) => string | null,
    supportedThinkingLevels: readonly ModelReasoningEffort[] = []
): AgentModelCapability[] {
    return normalizeModelIds(models).map((model) => ({
        id: model,
        label: getLabel(model) ?? model,
        supportedThinkingLevels: [...supportedThinkingLevels],
    }))
}

function getClaudeSettingsLayers(directory: string): Array<Record<string, unknown> | null> {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
    const sharedPath = findNearestConfigFile(directory, join('.claude', 'settings.json'))
    const localPath = findNearestConfigFile(directory, join('.claude', 'settings.local.json'))
    return [
        readJsonFile(join(configDir, 'settings.json')),
        sharedPath ? readJsonFile(sharedPath) : null,
        localPath ? readJsonFile(localPath) : null,
    ]
}

function readSettingsEnv(record: Record<string, unknown> | null, keys: readonly string[]): string | null {
    return readString(readRecord(record?.env), keys)
}

function readLayeredString(layers: Array<Record<string, unknown> | null>, keys: readonly string[]): string | null {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
        const value = readString(layers[index], keys)
        if (value) return value
    }
    return null
}

function readLayeredSettingsEnv(layers: Array<Record<string, unknown> | null>, keys: readonly string[]): string | null {
    for (let index = layers.length - 1; index >= 0; index -= 1) {
        const value = readSettingsEnv(layers[index], keys)
        if (value) return value
    }
    return null
}

function readMergedStringList(layers: Array<Record<string, unknown> | null>, key: string): string[] {
    return normalizeModelIds(
        layers.flatMap((layer) => {
            const value = layer?.[key]
            return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
        })
    )
}

function resolveClaudeLaunchConfig(directory: string): AgentLaunchConfig {
    const settingsLayers = getClaudeSettingsLayers(directory)
    const settingsEnvModel = readLayeredSettingsEnv(settingsLayers, CLAUDE_MODEL_ENV_KEYS)
    const settingsEnvEffort = readLayeredSettingsEnv(settingsLayers, CLAUDE_REASONING_ENV_KEYS)
    const configuredModel =
        readEnv(CLAUDE_MODEL_ENV_KEYS) ?? settingsEnvModel ?? readLayeredString(settingsLayers, ['model'])
    const configuredEffort = normalizeReasoningEffort(
        readEnv(CLAUDE_REASONING_ENV_KEYS) ?? settingsEnvEffort ?? readLayeredString(settingsLayers, ['effortLevel'])
    )
    const availableModels = readMergedStringList(settingsLayers, 'availableModels')

    return {
        agent: 'claude',
        availableModels: createCapabilities(
            preferFirst(configuredModel, availableModels),
            getClaudeModelLabel,
            orderReasoning(configuredEffort, CLAUDE_REASONING_EFFORTS)
        ),
    }
}

function mergeCodexConfig(...records: Array<Record<string, unknown> | null>): Record<string, unknown> {
    const merged = mergeRecords(...records)
    const profiles = mergeRecords(...records.map((record) => readRecord(record?.profiles)))
    return Object.keys(profiles).length > 0 ? { ...merged, profiles } : merged
}

function applyCodexProfile(config: Record<string, unknown>): Record<string, unknown> {
    const profile = readString(config, ['profile'])
    const profileConfig = profile ? readRecord(readRecord(config.profiles)?.[profile]) : null
    return profileConfig ? mergeCodexConfig(config, profileConfig) : config
}

function getCodexConfig(directory: string): Record<string, unknown> {
    const configDir = process.env.CODEX_HOME || join(homedir(), '.codex')
    const projectPath = findNearestConfigFile(directory, join('.codex', CODEX_CONFIG_FILE))
    const userConfig = readTomlFile(join(configDir, CODEX_CONFIG_FILE))
    const projectConfig = projectPath ? readTomlFile(projectPath) : null
    return applyCodexProfile(mergeCodexConfig(userConfig, projectConfig))
}

function resolveCodexLaunchConfig(directory: string): AgentLaunchConfig {
    const config = getCodexConfig(directory)
    const configuredModel = readString(config, ['model'])
    const configuredEffort = normalizeReasoningEffort(readString(config, ['model_reasoning_effort']))
    return {
        agent: 'codex',
        availableModels: createCapabilities(
            configuredModel ? [configuredModel] : [],
            (model) => CODEX_MODEL_LABELS[model as keyof typeof CODEX_MODEL_LABELS] ?? model,
            orderReasoning(configuredEffort, CODEX_REASONING_EFFORTS)
        ),
    }
}

function resolveGeminiLaunchConfig(directory: string): AgentLaunchConfig {
    const config = resolveGeminiRuntimeConfig({ cwd: directory })
    return {
        agent: 'gemini',
        availableModels: createCapabilities(config.model ? [config.model] : [], getGeminiModelLabel),
    }
}

function resolveCopilotLaunchConfig(): AgentLaunchConfig {
    return {
        agent: 'copilot',
        availableModels: createCapabilities(
            [COPILOT_DEFAULT_MODEL],
            (model) => COPILOT_MODEL_LABELS[model as keyof typeof COPILOT_MODEL_LABELS] ?? model
        ),
    }
}

function resolveStaticLaunchConfig(agent: 'cursor' | 'opencode'): AgentLaunchConfig {
    return { agent, availableModels: [] }
}

export function classifyAgentLaunchConfigError(error: unknown): AgentLaunchConfigErrorCode {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (/auth|token|api[_ -]?key|login|credential/.test(message)) return 'auth_missing'
    if (/config|settings|toml|json|profile/.test(message)) return 'config_missing'
    if (/model.*not found|unknown model|invalid model/.test(message)) return 'model_unavailable'
    if (/reasoning|thinking|effort/.test(message)) return 'reasoning_unsupported'
    if (/timeout|unavailable|spawn|connect|econn|enoent|failed/.test(message)) return 'provider_unavailable'
    return 'unknown'
}

export async function resolveAgentLaunchConfig(agent: AgentFlavor, directory: string): Promise<AgentLaunchConfig> {
    if (agent === 'pi') return await resolvePiAgentLaunchConfig(directory)
    if (agent === 'claude') return resolveClaudeLaunchConfig(directory)
    if (agent === 'codex') return resolveCodexLaunchConfig(directory)
    if (agent === 'gemini') return resolveGeminiLaunchConfig(directory)
    if (agent === 'copilot') return resolveCopilotLaunchConfig()
    return resolveStaticLaunchConfig(agent)
}
