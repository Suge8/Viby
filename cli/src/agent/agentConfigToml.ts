import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AgentConfigFieldDefinition, AgentConfigFieldValue } from '@viby/protocol/agentConfig'

type TomlSettings = Record<string, unknown>
type Assignment = { path: string; section: string; key: string; value: AgentConfigFieldValue }

function isMissingFile(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function splitPath(path: string): { section: string; key: string } {
    const parts = path.split('.')
    const key = parts.pop() ?? path
    return { section: parts.join('.'), key }
}

function readPath(settings: TomlSettings, path: string): unknown {
    let current: unknown = settings
    for (const part of path.split('.')) {
        if (!isRecord(current)) return undefined
        current = current[part]
    }
    return current
}

function setPath(settings: TomlSettings, path: string, value: unknown): void {
    const parts = path.split('.')
    let current = settings
    for (const part of parts.slice(0, -1)) {
        const next = current[part]
        if (!isRecord(next)) current[part] = {}
        current = current[part] as TomlSettings
    }
    current[parts[parts.length - 1] ?? path] = value
}

function parseTomlValue(raw: string): unknown {
    const value = raw.trim()
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
    if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value)
    if (value.startsWith('[') && value.endsWith(']')) return JSON.parse(value)
    return value
}

function parseSimpleToml(raw: string): TomlSettings {
    const parsed: TomlSettings = {}
    let section = ''
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        const sectionMatch = /^\[([^\]]+)\]$/.exec(trimmed)
        if (sectionMatch) {
            section = sectionMatch[1]
            continue
        }
        if (!trimmed || trimmed.startsWith('#')) continue
        const assignmentMatch = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/.exec(trimmed)
        if (!assignmentMatch) continue
        const path = section ? `${section}.${assignmentMatch[1]}` : assignmentMatch[1]
        setPath(parsed, path, parseTomlValue(assignmentMatch[2]))
    }
    return parsed
}

function getTomlParser(): { parse: (raw: string) => unknown } {
    return (
        (globalThis as { Bun?: { TOML?: { parse: (raw: string) => unknown } } }).Bun?.TOML ?? { parse: parseSimpleToml }
    )
}

function toTomlValue(value: AgentConfigFieldValue): string {
    if (typeof value === 'boolean' || typeof value === 'number') return String(value)
    if (Array.isArray(value)) return JSON.stringify(value)
    return JSON.stringify(String(value))
}

function isEmptyValue(value: AgentConfigFieldValue): boolean {
    return value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function submittedValue(
    field: AgentConfigFieldDefinition,
    values: Record<string, AgentConfigFieldValue>
): AgentConfigFieldValue | undefined {
    if (Object.hasOwn(values, field.id)) return values[field.id]
    if (Object.hasOwn(values, field.path)) return values[field.path]
    return undefined
}

function findSectionInsertIndex(lines: string[], section: string): number | null {
    let activeSection = ''
    let insertIndex: number | null = null
    for (let index = 0; index < lines.length; index += 1) {
        const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(lines[index])
        if (sectionMatch) {
            if (activeSection === section) return index
            activeSection = sectionMatch[1]
        }
        if (activeSection === section) insertIndex = index + 1
    }
    return activeSection === section ? insertIndex : null
}

function insertMissingAssignments(lines: string[], assignments: Assignment[], seenPaths: Set<string>): string[] {
    const nextLines = [...lines]
    const missing = assignments.filter(
        (assignment) => !seenPaths.has(assignment.path) && !isEmptyValue(assignment.value)
    )
    const rootLines = missing
        .filter((entry) => !entry.section)
        .map((assignment) => `${assignment.key} = ${toTomlValue(assignment.value)}`)
    if (rootLines.length > 0) {
        const firstSectionIndex = nextLines.findIndex((line) => /^\s*\[([^\]]+)\]\s*$/.test(line))
        if (firstSectionIndex === -1) {
            nextLines.push(...rootLines)
        } else {
            nextLines.splice(firstSectionIndex, 0, ...rootLines, '')
        }
    }

    const groupedSections = new Map<string, Assignment[]>()
    for (const assignment of missing.filter((entry) => entry.section)) {
        groupedSections.set(assignment.section, [...(groupedSections.get(assignment.section) ?? []), assignment])
    }
    for (const [section, entries] of groupedSections) {
        const newLines = entries.map((entry) => `${entry.key} = ${toTomlValue(entry.value)}`)
        const insertIndex = findSectionInsertIndex(nextLines, section)
        if (insertIndex === null) {
            if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') nextLines.push('')
            nextLines.push(`[${section}]`, ...newLines)
        } else {
            nextLines.splice(insertIndex, 0, ...newLines)
        }
    }
    return nextLines
}

function updateToml(raw: string, assignments: Assignment[]): string {
    let section = ''
    const seenPaths = new Set<string>()
    const assignmentByPath = new Map(assignments.map((assignment) => [assignment.path, assignment]))
    const lines = raw ? raw.split(/\r?\n/) : []
    const updatedLines = lines.flatMap((line) => {
        const sectionMatch = /^\s*\[([^\]]+)\]\s*$/.exec(line)
        if (sectionMatch) {
            section = sectionMatch[1]
            return [line]
        }
        const assignmentMatch = /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line)
        if (!assignmentMatch) return [line]
        const path = section ? `${section}.${assignmentMatch[1]}` : assignmentMatch[1]
        const assignment = assignmentByPath.get(path)
        if (!assignment) return [line]
        seenPaths.add(path)
        return isEmptyValue(assignment.value) ? [] : [`${assignment.key} = ${toTomlValue(assignment.value)}`]
    })

    const nextLines = insertMissingAssignments(updatedLines, assignments, seenPaths)
    return `${nextLines.join('\n').replace(/\n+$/, '')}\n`
}

export async function readTomlSettings(path: string): Promise<TomlSettings> {
    try {
        const raw = await readFile(path, 'utf-8')
        const parsed = getTomlParser().parse(raw)
        if (isRecord(parsed)) return parsed
        throw new Error('Config root must be a TOML table')
    } catch (error) {
        if (isMissingFile(error)) return {}
        throw error
    }
}

export function readTomlConfigValues(
    settings: TomlSettings,
    fields: readonly AgentConfigFieldDefinition[]
): Record<string, AgentConfigFieldValue> {
    return Object.fromEntries(
        fields.map((field) => {
            const value = readPath(settings, field.path)
            return [field.id, isFieldValue(value) ? value : (field.defaultValue ?? null)]
        })
    )
}

export async function writeTomlSettings(
    path: string,
    fields: readonly AgentConfigFieldDefinition[],
    values: Record<string, AgentConfigFieldValue>
): Promise<void> {
    let raw = ''
    try {
        raw = await readFile(path, 'utf-8')
    } catch (error) {
        if (!isMissingFile(error)) throw error
    }
    const assignments = fields
        .map((field): Assignment | null => {
            const value = submittedValue(field, values)
            return value === undefined ? null : { path: field.path, value, ...splitPath(field.path) }
        })
        .filter((assignment): assignment is Assignment => assignment !== null)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, updateToml(raw, assignments))
}
