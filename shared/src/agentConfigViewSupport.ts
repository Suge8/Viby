// View-layer helpers shared by every Agent Config surface (desktop panel, web page,
// future remote shells). Only pure functions and constants live here — render and
// i18n stay with the consumer, but draft shaping, grouping, version advisory, and
// backup formatting are computed once.

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
} from './agentConfig'

export type AgentConfigLanguage = 'zh' | 'en'
export type AgentConfigText = AgentConfigFieldDefinition['label']
export type AgentConfigDraftByDriver = Record<AgentConfigDriver, Record<string, AgentConfigFieldValue>>
export type AgentConfigFieldGroup = { group: string; fields: AgentConfigFieldDefinition[] }
export type AgentConfigAdvisory = {
    kind: 'outdated' | 'missing'
    installed: string | null
    supportedVersion: string
}

export const AGENT_CONFIG_VIEW_DRIVERS = AGENT_CONFIG_DRIVERS

export const AGENT_CONFIG_DRIVER_LABELS: Record<AgentConfigDriver, string> = {
    codex: 'Codex',
    claude: 'Claude',
    gemini: 'Gemini',
    pi: 'Pi',
    copilot: 'Copilot',
}

export const AGENT_CONFIG_GROUP_LABELS: Record<string, AgentConfigText> = {
    model: { en: 'Model', zh: '模型' },
    safety: { en: 'Safety', zh: '安全' },
    memory: { en: 'Memory', zh: '记忆' },
    git: { en: 'Git', zh: 'Git' },
    planning: { en: 'Planning', zh: '规划' },
    tools: { en: 'Tools', zh: '工具' },
    experimental: { en: 'Experimental', zh: '实验' },
    ui: { en: 'Interface', zh: '界面' },
    privacy: { en: 'Privacy', zh: '隐私' },
    runtime: { en: 'Runtime', zh: '运行' },
}

export function toAgentConfigLanguage(locale: string): AgentConfigLanguage {
    return locale.startsWith('zh') ? 'zh' : 'en'
}

export function localizeAgentConfigText(text: AgentConfigText, language: AgentConfigLanguage): string {
    return language === 'zh' ? text.zh : text.en
}

export function agentConfigGroupLabel(group: string, language: AgentConfigLanguage): string {
    return localizeAgentConfigText(AGENT_CONFIG_GROUP_LABELS[group] ?? { en: group, zh: group }, language)
}

function emptyDriverValues(driver: AgentConfigDriver): Record<string, AgentConfigFieldValue> {
    return Object.fromEntries(
        getAgentConfigFields(driver).map((field) => [field.id, field.defaultValue ?? null])
    ) as Record<string, AgentConfigFieldValue>
}

export function createAgentConfigDraft(response: AgentConfigResponse | null | undefined): AgentConfigDraftByDriver {
    const states = new Map(response?.agents.map((agent) => [agent.driver, agent]) ?? [])
    return Object.fromEntries(
        AGENT_CONFIG_DRIVERS.map((driver) => {
            const savedValues = states.get(driver)?.values ?? {}
            return [driver, { ...emptyDriverValues(driver), ...savedValues }]
        })
    ) as AgentConfigDraftByDriver
}

export function getAgentConfigState(
    response: AgentConfigResponse | null | undefined,
    driver: AgentConfigDriver
): AgentConfigFileState | null {
    return response?.agents.find((agent) => agent.driver === driver) ?? null
}

export function groupAgentConfigFields(fields: readonly AgentConfigFieldDefinition[]): AgentConfigFieldGroup[] {
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

export const areAgentConfigFieldValuesEqual = areAgentConfigValuesEqual

export function hasAgentConfigChanges(
    fields: readonly AgentConfigFieldDefinition[],
    draft: Record<string, AgentConfigFieldValue>,
    saved: Record<string, AgentConfigFieldValue> | undefined
): boolean {
    return Object.keys(createAgentConfigPatch(fields, draft, saved)).length > 0
}

export function updateAgentConfigDraftValue(
    current: AgentConfigDraftByDriver,
    driver: AgentConfigDriver,
    fieldId: string,
    value: AgentConfigFieldValue
): AgentConfigDraftByDriver {
    return { ...current, [driver]: { ...current[driver], [fieldId]: value } }
}

export function getAgentConfigAdvisory(state: AgentConfigFileState | null | undefined): AgentConfigAdvisory | null {
    if (!state) return null
    if (state.version.status === 'outdated') {
        return {
            kind: 'outdated',
            installed: state.version.installedVersion ?? null,
            supportedVersion: state.version.supportedVersion,
        }
    }
    if (state.version.status === 'missing') {
        return { kind: 'missing', installed: null, supportedVersion: state.version.supportedVersion }
    }
    return null
}

export function formatAgentConfigBackupTime(timestamp: number, language: AgentConfigLanguage): string {
    return new Date(timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}
