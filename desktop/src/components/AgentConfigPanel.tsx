import {
    AGENT_CONFIG_DRIVERS,
    type AgentConfigDriver,
    type AgentConfigFieldDefinition,
    type AgentConfigFieldValue,
    type AgentConfigResponse,
    createAgentConfigValuePatch,
    getAgentConfigFields,
    type SaveAgentConfigRequest,
} from '@viby/protocol'
import { type JSX, useEffect, useMemo, useState } from 'react'
import type { AgentConfigErrorCode } from '@/hooks/useAgentConfig'
import { AGENT_ICONS, AGENT_LABELS } from '@/lib/agentPresentation'
import type { DesktopCopy } from '@/lib/desktopCopy'

type DraftByDriver = Record<AgentConfigDriver, Record<string, AgentConfigFieldValue>>

type AgentConfigPanelProps = {
    copy: DesktopCopy
    error: AgentConfigErrorCode | null
    language: 'zh' | 'en'
    loading: boolean
    response: AgentConfigResponse | null
    restoringDriver: AgentConfigDriver | null
    savingDriver: AgentConfigDriver | null
    onRefresh(): void
    onRestore(driver: AgentConfigDriver, backupPath: string): Promise<boolean>
    onSave(request: SaveAgentConfigRequest): Promise<boolean>
}

type FieldControlProps = {
    copy: DesktopCopy
    disabled: boolean
    field: AgentConfigFieldDefinition
    language: 'zh' | 'en'
    value: AgentConfigFieldValue
    onChange(value: AgentConfigFieldValue): void
}

const GROUP_LABELS: Record<string, { zh: string; en: string }> = {
    model: { zh: '模型', en: 'Model' },
    safety: { zh: '安全', en: 'Safety' },
    memory: { zh: '记忆', en: 'Memory' },
    git: { zh: 'Git', en: 'Git' },
    planning: { zh: '规划', en: 'Planning' },
    tools: { zh: '工具', en: 'Tools' },
    ui: { zh: '界面', en: 'Interface' },
    privacy: { zh: '隐私', en: 'Privacy' },
    runtime: { zh: '运行', en: 'Runtime' },
}

function localize(text: { zh: string; en: string }, language: 'zh' | 'en'): string {
    return language === 'zh' ? text.zh : text.en
}

function defaultDraft(): DraftByDriver {
    return Object.fromEntries(
        AGENT_CONFIG_DRIVERS.map((driver) => [
            driver,
            Object.fromEntries(getAgentConfigFields(driver).map((field) => [field.id, field.defaultValue ?? null])),
        ])
    ) as DraftByDriver
}

function responseDraft(response: AgentConfigResponse | null): DraftByDriver {
    const draft = defaultDraft()
    for (const agent of response?.agents ?? []) {
        draft[agent.driver] = { ...draft[agent.driver], ...agent.values }
    }
    return draft
}

function fieldGroups(fields: readonly AgentConfigFieldDefinition[]) {
    const groups = new Map<string, AgentConfigFieldDefinition[]>()
    for (const field of fields) {
        groups.set(field.group, [...(groups.get(field.group) ?? []), field])
    }
    return [...groups.entries()]
}

function stringValue(value: AgentConfigFieldValue): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function listValue(value: AgentConfigFieldValue): string {
    return Array.isArray(value) ? value.join('\n') : ''
}

function parseListValue(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
}

function getErrorLabel(copy: DesktopCopy, error: AgentConfigErrorCode): string {
    if (error === 'hub_unavailable') return copy.agentConfigHubUnavailable
    if (error === 'save_failed') return copy.agentConfigSaveFailed
    return copy.agentConfigLoadFailed
}

function versionMessage(copy: DesktopCopy, state: AgentConfigResponse['agents'][number] | null): string {
    if (!state?.version) return copy.agentConfigVersionRequired
    const installed = state.version.installedVersion ?? copy.agentConfigVersionMissing
    const command = state.version.command ? ` (${state.version.command})` : ''
    return `${copy.agentConfigVersionRequired}: ${installed} -> ${state.version.supportedVersion}${command}`
}

function FieldControl(props: FieldControlProps): JSX.Element {
    if (props.field.control === 'toggle') {
        return (
            <label className="desktop-agent-config-switch">
                <input
                    type="checkbox"
                    checked={props.value === true}
                    disabled={props.disabled}
                    onChange={(event) => props.onChange(event.currentTarget.checked)}
                />
                <span />
            </label>
        )
    }

    if (props.field.control === 'select') {
        return (
            <select
                className="desktop-agent-config-field-control"
                value={stringValue(props.value)}
                disabled={props.disabled}
                onChange={(event) => props.onChange(event.currentTarget.value)}
            >
                <option value="">{props.copy.agentConfigSystemDefault}</option>
                {(props.field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                        {localize(option.label, props.language)}
                    </option>
                ))}
            </select>
        )
    }

    if (props.field.control === 'list') {
        return (
            <textarea
                className="desktop-agent-config-field-control is-textarea"
                value={listValue(props.value)}
                disabled={props.disabled}
                onChange={(event) => props.onChange(parseListValue(event.currentTarget.value))}
            />
        )
    }

    return (
        <input
            className="desktop-agent-config-field-control"
            type={props.field.control === 'number' ? 'number' : 'text'}
            value={stringValue(props.value)}
            disabled={props.disabled}
            onChange={(event) => {
                const value = event.currentTarget.value
                props.onChange(props.field.control === 'number' ? Number(value) : value)
            }}
        />
    )
}

export function AgentConfigPanel(props: AgentConfigPanelProps): JSX.Element {
    const [selectedDriver, setSelectedDriver] = useState<AgentConfigDriver>('codex')
    const [draft, setDraft] = useState<DraftByDriver>(() => responseDraft(props.response))
    const [savedDriver, setSavedDriver] = useState<AgentConfigDriver | null>(null)
    const fields = useMemo(() => getAgentConfigFields(selectedDriver), [selectedDriver])
    const state = props.response?.agents.find((agent) => agent.driver === selectedDriver) ?? null
    const changedValues = createAgentConfigValuePatch(fields, draft[selectedDriver], state?.values)
    const changed = Object.keys(changedValues).length > 0
    const saving = props.savingDriver === selectedDriver
    const restoring = props.restoringDriver === selectedDriver
    const latestBackup = state?.backups?.[0] ?? null
    const versionBlocked = Boolean(state && state.version.status !== 'supported')

    useEffect(() => setDraft(responseDraft(props.response)), [props.response])

    const updateField = (fieldId: string, value: AgentConfigFieldValue): void => {
        setSavedDriver(null)
        setDraft((current) => ({
            ...current,
            [selectedDriver]: { ...current[selectedDriver], [fieldId]: value },
        }))
    }

    const save = async (): Promise<void> => {
        const saved = await props.onSave({
            driver: selectedDriver,
            values: changedValues,
            expectedExists: state?.exists ?? false,
            expectedStamp: state?.stamp,
        })
        if (saved) setSavedDriver(selectedDriver)
    }

    const restore = async (): Promise<void> => {
        if (!latestBackup) return
        const restored = await props.onRestore(selectedDriver, latestBackup.path)
        if (restored) setSavedDriver(selectedDriver)
    }

    return (
        <div className="desktop-agent-config-panel">
            <div className="desktop-agent-config-tabs" role="tablist" aria-label={props.copy.agentConfigAgentsLabel}>
                {AGENT_CONFIG_DRIVERS.map((driver) => {
                    const driverState = props.response?.agents.find((agent) => agent.driver === driver) ?? null
                    return (
                        <button
                            key={driver}
                            type="button"
                            className={driver === selectedDriver ? 'is-active' : ''}
                            onClick={() => setSelectedDriver(driver)}
                        >
                            <img src={AGENT_ICONS[driver]} alt="" />
                            <span>{AGENT_LABELS[driver]}</span>
                            {driverState && driverState.version.status !== 'supported' ? (
                                <small>{props.copy.agentConfigVersionBlockedShort}</small>
                            ) : null}
                        </button>
                    )
                })}
            </div>

            {props.error ? (
                <div className="desktop-inline-notice is-error">{getErrorLabel(props.copy, props.error)}</div>
            ) : null}
            {state?.error ? <div className="desktop-inline-notice is-warning">{state.error}</div> : null}
            {versionBlocked ? (
                <div className="desktop-inline-notice is-warning">
                    {props.copy.agentConfigVersionBlocked}. {versionMessage(props.copy, state)}
                </div>
            ) : null}

            <div className="desktop-agent-config-grid">
                {fieldGroups(fields).map(([group, groupFields]) => (
                    <section key={group} className="desktop-agent-config-card">
                        <h3>{localize(GROUP_LABELS[group] ?? { zh: group, en: group }, props.language)}</h3>
                        {groupFields.map((field) => (
                            <div key={field.id} className="desktop-agent-config-row">
                                <div>
                                    <strong>{localize(field.label, props.language)}</strong>
                                    <span>{localize(field.help, props.language)}</span>
                                    <code>{field.path}</code>
                                </div>
                                <FieldControl
                                    copy={props.copy}
                                    disabled={props.loading || saving || versionBlocked}
                                    field={field}
                                    language={props.language}
                                    value={draft[selectedDriver][field.id] ?? field.defaultValue ?? null}
                                    onChange={(value) => updateField(field.id, value)}
                                />
                            </div>
                        ))}
                    </section>
                ))}
            </div>

            <div className="desktop-agent-config-savebar">
                <div>
                    <strong>{state?.path ?? props.copy.agentConfigPathPending}</strong>
                    <span>
                        {savedDriver === selectedDriver ? props.copy.agentConfigSaved : props.copy.agentConfigSaveHint}
                    </span>
                </div>
                <button
                    type="button"
                    disabled={!latestBackup || restoring || props.loading || versionBlocked}
                    onClick={() => void restore()}
                >
                    {restoring ? props.copy.agentConfigRestoring : props.copy.agentConfigRestore}
                </button>
                <button
                    type="button"
                    disabled={!changed || saving || props.loading || versionBlocked}
                    onClick={() => void save()}
                >
                    {saving ? props.copy.agentConfigSaving : props.copy.agentConfigSave}
                </button>
            </div>
        </div>
    )
}
