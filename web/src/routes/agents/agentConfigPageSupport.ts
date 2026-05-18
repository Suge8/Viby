import {
    AGENT_CONFIG_DRIVERS,
    type AgentConfigDriver,
    type AgentConfigFieldDefinition,
    type AgentConfigFieldValue,
    type AgentConfigFileState,
    type AgentConfigResponse,
    areAgentConfigValuesEqual,
    createAgentConfigValuePatch,
    getAgentConfigFields,
} from '@viby/protocol'
import type { Locale } from '@/lib/use-translation'

type DraftByDriver = Record<AgentConfigDriver, Record<string, AgentConfigFieldValue>>
type LocaleText = AgentConfigFieldDefinition['label']

export const CONFIG_DRIVERS = AGENT_CONFIG_DRIVERS

export const DRIVER_LABELS: Record<AgentConfigDriver, string> = {
    codex: 'Codex',
    claude: 'Claude',
    gemini: 'Gemini',
    pi: 'Pi',
    copilot: 'Copilot',
}

const GROUP_LABELS: Record<string, LocaleText> = {
    model: { en: 'Model', zh: '模型' },
    safety: { en: 'Safety', zh: '安全' },
    memory: { en: 'Memory', zh: '记忆' },
    git: { en: 'Git', zh: 'Git' },
    planning: { en: 'Planning', zh: '规划' },
    tools: { en: 'Tools', zh: '工具' },
    ui: { en: 'Interface', zh: '界面' },
    privacy: { en: 'Privacy', zh: '隐私' },
    runtime: { en: 'Runtime', zh: '运行' },
}

function emptyDriverValues(driver: AgentConfigDriver): Record<string, AgentConfigFieldValue> {
    return Object.fromEntries(
        getAgentConfigFields(driver).map((field) => [field.id, field.defaultValue ?? null])
    ) as Record<string, AgentConfigFieldValue>
}

export function localizeText(text: LocaleText, locale: Locale): string {
    return locale.startsWith('zh') ? text.zh : text.en
}

export function groupLabel(group: string, locale: Locale): string {
    const label = GROUP_LABELS[group] ?? { en: group, zh: group }
    return localizeText(label, locale)
}

export function createAgentConfigDraft(response: AgentConfigResponse | null | undefined): DraftByDriver {
    const states = new Map(response?.agents.map((agent) => [agent.driver, agent]) ?? [])
    return Object.fromEntries(
        CONFIG_DRIVERS.map((driver) => {
            const savedValues = states.get(driver)?.values ?? {}
            return [driver, { ...emptyDriverValues(driver), ...savedValues }]
        })
    ) as DraftByDriver
}

export function getAgentConfigState(
    response: AgentConfigResponse | null | undefined,
    driver: AgentConfigDriver
): AgentConfigFileState | null {
    return response?.agents.find((agent) => agent.driver === driver) ?? null
}

export function groupFields(
    fields: readonly AgentConfigFieldDefinition[]
): Array<{ group: string; fields: AgentConfigFieldDefinition[] }> {
    const groups = new Map<string, AgentConfigFieldDefinition[]>()
    for (const field of fields) {
        groups.set(field.group, [...(groups.get(field.group) ?? []), field])
    }
    return [...groups.entries()].map(([group, groupedFields]) => ({ group, fields: groupedFields }))
}

export function createAgentConfigPatch(
    fields: readonly AgentConfigFieldDefinition[],
    draft: Record<string, AgentConfigFieldValue>,
    saved: Record<string, AgentConfigFieldValue> | undefined
): Record<string, AgentConfigFieldValue> {
    return createAgentConfigValuePatch(fields, draft, saved)
}

export const areFieldValuesEqual = areAgentConfigValuesEqual

export function hasAgentConfigChanges(
    fields: readonly AgentConfigFieldDefinition[],
    draft: Record<string, AgentConfigFieldValue>,
    saved: Record<string, AgentConfigFieldValue> | undefined
): boolean {
    return Object.keys(createAgentConfigPatch(fields, draft, saved)).length > 0
}

export function updateDraftValue(
    current: DraftByDriver,
    driver: AgentConfigDriver,
    fieldId: string,
    value: AgentConfigFieldValue
): DraftByDriver {
    return {
        ...current,
        [driver]: {
            ...current[driver],
            [fieldId]: value,
        },
    }
}
