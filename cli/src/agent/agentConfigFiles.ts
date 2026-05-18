import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
    AGENT_CONFIG_DRIVERS,
    type AgentConfigDriver,
    type AgentConfigFieldValue,
    type AgentConfigFileState,
    type AgentConfigResponse,
    getAgentConfigFields,
    type RestoreAgentConfigRequest,
    RestoreAgentConfigRequestSchema,
    type SaveAgentConfigRequest,
    SaveAgentConfigRequestSchema,
} from '@viby/protocol/agentConfig'
import {
    assertAgentConfigUnchanged,
    createAgentConfigBackup,
    listAgentConfigBackups,
    readAgentConfigStamp,
    restoreAgentConfigBackupFile,
} from './agentConfigFileMetadata'
import { applyJsonConfigValues, readJsonConfigValues, readJsonSettings, writeJsonSettings } from './agentConfigJson'
import { readTomlConfigValues, readTomlSettings, writeTomlSettings } from './agentConfigToml'
import { assertAgentConfigVersionSupported, readAgentConfigVersion } from './agentConfigVersions'

type AgentConfigFileOptions = {
    readVersion?: typeof readAgentConfigVersion
}

function normalizeConfigRoot(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim()
    return trimmed || fallback
}

function agentConfigPath(driver: AgentConfigDriver): string {
    switch (driver) {
        case 'codex':
            return join(normalizeConfigRoot(process.env.CODEX_HOME, join(homedir(), '.codex')), 'config.toml')
        case 'claude':
            return join(normalizeConfigRoot(process.env.CLAUDE_CONFIG_DIR, join(homedir(), '.claude')), 'settings.json')
        case 'gemini':
            return join(normalizeConfigRoot(process.env.GEMINI_CLI_HOME, homedir()), '.gemini', 'settings.json')
        case 'pi':
            return join(
                normalizeConfigRoot(process.env.PI_CODING_AGENT_DIR, join(homedir(), '.pi', 'agent')),
                'settings.json'
            )
        case 'copilot':
            return join(normalizeConfigRoot(process.env.COPILOT_HOME, join(homedir(), '.copilot')), 'settings.json')
    }
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path)
        return true
    } catch {
        return false
    }
}

function defaultValues(driver: AgentConfigDriver): Record<string, AgentConfigFieldValue> {
    return Object.fromEntries(
        getAgentConfigFields(driver).map((field) => [field.id, field.defaultValue ?? null])
    ) as Record<string, AgentConfigFieldValue>
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

async function readConfigState(
    driver: AgentConfigDriver,
    options: AgentConfigFileOptions = {}
): Promise<AgentConfigFileState> {
    const path = agentConfigPath(driver)
    const fields = getAgentConfigFields(driver)
    const exists = await pathExists(path)
    const [stamp, backups, version] = await Promise.all([
        readAgentConfigStamp(path),
        listAgentConfigBackups(path),
        (options.readVersion ?? readAgentConfigVersion)(driver),
    ])
    try {
        const values =
            driver === 'codex'
                ? readTomlConfigValues(await readTomlSettings(path), fields)
                : readJsonConfigValues(await readJsonSettings(path), fields)
        return { driver, path, exists, values, version, stamp, backups }
    } catch (error) {
        return {
            driver,
            path,
            exists,
            values: defaultValues(driver),
            version,
            stamp,
            backups,
            error: errorMessage(error),
        }
    }
}

export async function loadAgentConfigFiles(options: AgentConfigFileOptions = {}): Promise<AgentConfigResponse> {
    return { agents: await Promise.all(AGENT_CONFIG_DRIVERS.map((driver) => readConfigState(driver, options))) }
}

export async function saveAgentConfigFile(
    request: SaveAgentConfigRequest,
    options: AgentConfigFileOptions = {}
): Promise<AgentConfigFileState> {
    const parsed = SaveAgentConfigRequestSchema.parse(request)
    const path = agentConfigPath(parsed.driver)
    const fields = getAgentConfigFields(parsed.driver)
    await assertAgentConfigVersionSupported(parsed.driver, options.readVersion)
    await assertAgentConfigUnchanged(path, parsed.expectedExists, parsed.expectedStamp)
    await createAgentConfigBackup(path)
    if (parsed.driver === 'codex') {
        await writeTomlSettings(path, fields, parsed.values)
    } else {
        const settings = await readJsonSettings(path)
        await writeJsonSettings(path, applyJsonConfigValues(settings, fields, parsed.values))
    }
    return await readConfigState(parsed.driver, options)
}

export async function restoreAgentConfigFile(
    request: RestoreAgentConfigRequest,
    options: AgentConfigFileOptions = {}
): Promise<AgentConfigFileState> {
    const parsed = RestoreAgentConfigRequestSchema.parse(request)
    await assertAgentConfigVersionSupported(parsed.driver, options.readVersion)
    await restoreAgentConfigBackupFile(agentConfigPath(parsed.driver), parsed.backupPath)
    return await readConfigState(parsed.driver, options)
}
