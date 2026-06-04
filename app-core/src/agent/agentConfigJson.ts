import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AgentConfigFieldDefinition, AgentConfigFieldValue } from '@viby/protocol/agentConfig'

const CLAUDE_SECRET_DENY_RULES = ['Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)'] as const

type JsonSettings = Record<string, unknown>

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function stripJsonComments(raw: string): string {
    let output = ''
    let inString = false
    let escaped = false
    let blockComment = false
    let lineComment = false

    for (let index = 0; index < raw.length; index += 1) {
        const current = raw[index]
        const next = raw[index + 1]
        if (lineComment) {
            if (current === '\n') {
                lineComment = false
                output += current
            }
            continue
        }
        if (blockComment) {
            if (current === '*' && next === '/') {
                blockComment = false
                index += 1
            }
            continue
        }
        if (!inString && current === '/' && next === '/') {
            lineComment = true
            index += 1
            continue
        }
        if (!inString && current === '/' && next === '*') {
            blockComment = true
            index += 1
            continue
        }
        output += current
        if (escaped) {
            escaped = false
        } else if (current === '\\') {
            escaped = true
        } else if (current === '"') {
            inString = !inString
        }
    }
    return output
}

function stripTrailingCommas(raw: string): string {
    return raw.replace(/,\s*([}\]])/g, '$1')
}

function isJsonObject(value: unknown): value is JsonSettings {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFieldValue(value: unknown): value is AgentConfigFieldValue {
    return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        (Array.isArray(value) && value.every((entry) => typeof entry === 'string'))
    )
}

function pathParts(path: string): string[] {
    return path.split('.').filter(Boolean)
}

function readPath(settings: JsonSettings, path: string): unknown {
    let current: unknown = settings
    for (const part of pathParts(path)) {
        if (!isJsonObject(current)) return undefined
        current = current[part]
    }
    return current
}

function setPath(settings: JsonSettings, path: string, value: AgentConfigFieldValue): void {
    const parts = pathParts(path)
    let current = settings
    for (const part of parts.slice(0, -1)) {
        const next = current[part]
        if (!isJsonObject(next)) current[part] = {}
        current = current[part] as JsonSettings
    }
    current[parts[parts.length - 1] ?? path] = value
}

function deletePath(settings: JsonSettings, path: string): void {
    const parts = pathParts(path)
    let current: unknown = settings
    for (const part of parts.slice(0, -1)) {
        if (!isJsonObject(current)) return
        current = current[part]
    }
    if (isJsonObject(current)) delete current[parts[parts.length - 1] ?? path]
}

function cloneJson(settings: JsonSettings): JsonSettings {
    return JSON.parse(JSON.stringify(settings)) as JsonSettings
}

function submittedValue(
    field: AgentConfigFieldDefinition,
    values: Record<string, AgentConfigFieldValue>
): AgentConfigFieldValue | undefined {
    if (Object.hasOwn(values, field.id)) return values[field.id]
    if (Object.hasOwn(values, field.path)) return values[field.path]
    return undefined
}

function readSpecialValue(
    settings: JsonSettings,
    field: AgentConfigFieldDefinition
): AgentConfigFieldValue | undefined {
    if (field.id === 'claude.permissions.disableBypassPermissionsMode') {
        return readPath(settings, field.path) === 'disable'
    }
    if (field.id === 'claude.permissions.denySensitiveFiles') {
        const denyRules = readPath(settings, field.path)
        return (
            Array.isArray(denyRules) &&
            CLAUDE_SECRET_DENY_RULES.every((rule) => denyRules.some((entry) => entry === rule))
        )
    }
    return undefined
}

function writeSpecialValue(
    settings: JsonSettings,
    field: AgentConfigFieldDefinition,
    value: AgentConfigFieldValue
): boolean {
    if (field.id === 'claude.permissions.disableBypassPermissionsMode') {
        value === true ? setPath(settings, field.path, 'disable') : deletePath(settings, field.path)
        return true
    }
    if (field.id !== 'claude.permissions.denySensitiveFiles') return false

    const current = readPath(settings, field.path)
    const existing = Array.isArray(current) ? current.filter((entry): entry is string => typeof entry === 'string') : []
    const secretRules: readonly string[] = CLAUDE_SECRET_DENY_RULES
    const withoutSecretRules = existing.filter((entry) => !secretRules.includes(entry))
    const next = value === true ? [...withoutSecretRules, ...CLAUDE_SECRET_DENY_RULES] : withoutSecretRules
    next.length > 0 ? setPath(settings, field.path, next) : deletePath(settings, field.path)
    return true
}

export async function readJsonSettings(path: string): Promise<JsonSettings> {
    try {
        const raw = await readFile(path, 'utf-8')
        const parsed = JSON.parse(stripTrailingCommas(stripJsonComments(raw)))
        if (isJsonObject(parsed)) return parsed
        throw new Error('Settings root must be an object')
    } catch (error) {
        if (isMissingFile(error)) return {}
        throw error
    }
}

export function readJsonConfigValues(
    settings: JsonSettings,
    fields: readonly AgentConfigFieldDefinition[]
): Record<string, AgentConfigFieldValue> {
    return Object.fromEntries(
        fields.map((field) => {
            const value = readSpecialValue(settings, field) ?? readPath(settings, field.path)
            return [field.id, isFieldValue(value) ? value : (field.defaultValue ?? null)]
        })
    )
}

export function applyJsonConfigValues(
    settings: JsonSettings,
    fields: readonly AgentConfigFieldDefinition[],
    values: Record<string, AgentConfigFieldValue>
): JsonSettings {
    const nextSettings = cloneJson(settings)
    for (const field of fields) {
        const value = submittedValue(field, values)
        if (value === undefined) continue
        if (writeSpecialValue(nextSettings, field, value)) continue
        value === null || value === '' ? deletePath(nextSettings, field.path) : setPath(nextSettings, field.path, value)
    }
    return nextSettings
}

export async function writeJsonSettings(path: string, settings: JsonSettings): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`)
}
