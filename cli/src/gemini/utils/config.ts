import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve } from 'node:path'
import { logger } from '@/ui/logger'

export const GEMINI_API_KEY_ENV = 'GEMINI_API_KEY'
export const GOOGLE_API_KEY_ENV = 'GOOGLE_API_KEY'
export const GEMINI_MODEL_ENV = 'GEMINI_MODEL'
export const GEMINI_CLI_HOME_ENV = 'GEMINI_CLI_HOME'

const SYSTEM_DEFAULTS_ENV = 'GEMINI_CLI_SYSTEM_DEFAULTS_PATH'
const SYSTEM_SETTINGS_ENV = 'GEMINI_CLI_SYSTEM_SETTINGS_PATH'

type GeminiEnvKey = typeof GEMINI_MODEL_ENV | typeof GEMINI_API_KEY_ENV | typeof GOOGLE_API_KEY_ENV
type GeminiEnvConfig = Partial<Record<GeminiEnvKey, string>>

export type GeminiLocalConfig = {
    token?: string
    model?: string
    env: GeminiEnvConfig
}

export type GeminiModelSource = 'explicit' | 'env' | 'local' | 'terminal-default'

function readJsonFile(path: string): Record<string, unknown> | null {
    if (!existsSync(path)) return null

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8'))
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null
    } catch (error) {
        logger.debug(`[gemini-config] Failed to read ${path}: ${error}`)
        return null
    }
}

function mergeRecords(...records: Array<Record<string, unknown> | null | undefined>): Record<string, unknown> {
    return Object.assign({}, ...records.filter(Boolean))
}

function extractModel(settings: Record<string, unknown>): string | undefined {
    const modelEntry = settings.model
    if (modelEntry && typeof modelEntry === 'object') {
        const name = (modelEntry as Record<string, unknown>).name
        if (typeof name === 'string' && name.trim()) return name.trim()
    }
    return typeof modelEntry === 'string' && modelEntry.trim() ? modelEntry.trim() : undefined
}

function extractToken(settings: Record<string, unknown>): string | undefined {
    const tokenKeys = ['access_token', 'token', 'apiKey', GEMINI_API_KEY_ENV, GOOGLE_API_KEY_ENV]
    for (const key of tokenKeys) {
        const value = settings[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return undefined
}

function resolveLocalToken(
    oauthFile: Record<string, unknown> | null,
    configFile: Record<string, unknown> | null
): string | undefined {
    return (oauthFile && extractToken(oauthFile)) || (configFile && extractToken(configFile)) || undefined
}

function getSystemSettingsPath(kind: 'defaults' | 'settings'): string {
    const file = kind === 'defaults' ? 'system-defaults.json' : 'settings.json'
    const override = process.env[kind === 'defaults' ? SYSTEM_DEFAULTS_ENV : SYSTEM_SETTINGS_ENV]
    if (override?.trim()) return override.trim()
    if (process.platform === 'darwin') return join('/Library/Application Support/GeminiCli', file)
    if (process.platform === 'win32') return join(process.env.ProgramData ?? 'C:\\ProgramData', 'gemini-cli', file)
    return join('/etc/gemini-cli', file)
}

function normalizeConfigString(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim()
    return trimmed || undefined
}

function getGeminiUserDir(): string {
    return join(normalizeConfigString(process.env[GEMINI_CLI_HOME_ENV]) ?? homedir(), '.gemini')
}

function findNearestFile(startDirectory: string, fileName: string): string | null {
    let current = resolve(startDirectory)
    const root = parse(current).root
    while (true) {
        const candidate = join(current, fileName)
        if (existsSync(candidate)) return candidate
        if (current === root) return null
        current = dirname(current)
    }
}

function findProjectEnvFile(startDirectory: string, relativePath: string): string | null {
    let current = resolve(startDirectory)
    const root = parse(current).root
    const home = homedir()
    while (true) {
        const candidate = join(current, relativePath)
        if (existsSync(candidate)) return candidate
        if (current === root || current === home || existsSync(join(current, '.git'))) return null
        current = dirname(current)
    }
}

function parseEnvValue(value: string): string | undefined {
    const trimmed = value.trim()
    const quote = trimmed[0]
    if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
        return normalizeConfigString(trimmed.slice(1, -1))
    }

    return normalizeConfigString(trimmed.replace(/\s+#.*$/, ''))
}

function readEnvFile(path: string | null): GeminiEnvConfig {
    if (!path || !existsSync(path)) return {}

    const env: GeminiEnvConfig = {}
    for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(trimmed)
        if (!match) continue
        const key = match[1] as keyof GeminiEnvConfig
        if (key !== GEMINI_MODEL_ENV && key !== GEMINI_API_KEY_ENV && key !== GOOGLE_API_KEY_ENV) continue
        const value = parseEnvValue(match[2])
        if (value) env[key] = value
    }
    return env
}

function mergeEnvConfigs(...configs: GeminiEnvConfig[]): GeminiEnvConfig {
    return Object.assign({}, ...configs)
}

function readGeminiEnv(cwd: string, geminiDir: string): GeminiEnvConfig {
    const projectPlainEnv = findProjectEnvFile(cwd, '.env')
    const projectGeminiEnv = findProjectEnvFile(cwd, join('.gemini', '.env'))
    return mergeEnvConfigs(
        readEnvFile(projectPlainEnv ? null : join(homedir(), '.env')),
        readEnvFile(projectGeminiEnv ? null : join(geminiDir, '.env')),
        readEnvFile(projectPlainEnv),
        readEnvFile(projectGeminiEnv)
    )
}

export function readGeminiLocalConfig(cwd: string = process.cwd()): GeminiLocalConfig {
    const geminiDir = getGeminiUserDir()
    const projectSettingsPath = findNearestFile(cwd, join('.gemini', 'settings.json'))
    const settings = mergeRecords(
        readJsonFile(getSystemSettingsPath('defaults')),
        readJsonFile(join(geminiDir, 'settings.json')),
        projectSettingsPath ? readJsonFile(projectSettingsPath) : null,
        readJsonFile(getSystemSettingsPath('settings'))
    )
    const oauthFile = readJsonFile(join(geminiDir, 'oauth_creds.json'))
    const configFile = readJsonFile(join(geminiDir, 'config.json'))

    return {
        model: extractModel(settings),
        token: resolveLocalToken(oauthFile, configFile),
        env: readGeminiEnv(cwd, geminiDir),
    }
}

function resolveGeminiModelSource(options: {
    explicitModel?: string
    envModel?: string
    localModel?: string
}): GeminiModelSource {
    if (options.explicitModel) return 'explicit'
    if (options.envModel) return 'env'
    if (options.localModel) return 'local'
    return 'terminal-default'
}

export function resolveGeminiRuntimeConfig(opts: { model?: string; token?: string; cwd?: string } = {}): {
    model?: string
    token?: string
    modelSource: GeminiModelSource
} {
    const local = readGeminiLocalConfig(opts.cwd)
    const explicitModel = normalizeConfigString(opts.model)
    const envModel = normalizeConfigString(process.env[GEMINI_MODEL_ENV]) ?? local.env[GEMINI_MODEL_ENV]
    const model = explicitModel ?? envModel ?? local.model
    const token =
        normalizeConfigString(opts.token) ??
        normalizeConfigString(process.env[GEMINI_API_KEY_ENV]) ??
        normalizeConfigString(process.env[GOOGLE_API_KEY_ENV]) ??
        local.env[GEMINI_API_KEY_ENV] ??
        local.env[GOOGLE_API_KEY_ENV] ??
        local.token

    return {
        model,
        token,
        modelSource: resolveGeminiModelSource({ explicitModel, envModel, localModel: local.model }),
    }
}

export function buildGeminiEnv(opts: {
    model?: string
    token?: string
    hookSettingsPath?: string
    cwd?: string
}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env }

    if (opts.model) env[GEMINI_MODEL_ENV] = opts.model
    if (opts.token && !env[GEMINI_API_KEY_ENV] && !env[GOOGLE_API_KEY_ENV]) env[GEMINI_API_KEY_ENV] = opts.token
    if (opts.hookSettingsPath) env.GEMINI_CLI_SYSTEM_SETTINGS_PATH = opts.hookSettingsPath
    if (opts.cwd) env.GEMINI_PROJECT_DIR = opts.cwd

    return env
}
