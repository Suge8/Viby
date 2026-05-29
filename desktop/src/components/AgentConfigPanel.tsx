import {
    AGENT_CONFIG_VIEW_DRIVERS,
    type AgentConfigDraftByDriver,
    type AgentConfigDriver,
    type AgentConfigFieldValue,
    type AgentConfigFileState,
    type AgentConfigLanguage,
    type AgentConfigResponse,
    agentConfigGroupLabel,
    createAgentConfigDraft,
    createAgentConfigPatch,
    formatAgentConfigBackupTime,
    getAgentConfigAdvisory,
    getAgentConfigFields,
    getAgentConfigState,
    groupAgentConfigFields,
    localizeAgentConfigText,
    type SaveAgentConfigRequest,
    updateAgentConfigDraftValue,
} from '@viby/protocol'
import { type JSX, useEffect, useMemo, useState } from 'react'
import type { AgentConfigErrorCode } from '@/hooks/useAgentConfig'
import { AGENT_LABELS } from '@/lib/agentPresentation'
import type { DesktopCopy } from '@/lib/desktopCopy'
import { AgentBrandIcon } from './AgentBrandIcon'
import { AgentConfigFieldControl } from './AgentConfigFieldControl'
import { DesktopSegmentedControl } from './DesktopSegmentedControl'
import { LinkIcon, SpinnerIcon } from './icons'
import { PresenceSwap } from './motion'

type AgentConfigPanelProps = {
    copy: DesktopCopy
    error: AgentConfigErrorCode | null
    language: AgentConfigLanguage
    loading: boolean
    openingDriver: AgentConfigDriver | null
    response: AgentConfigResponse | null
    restoringDriver: AgentConfigDriver | null
    savingDriver: AgentConfigDriver | null
    onRefresh(): void
    onOpen(driver: AgentConfigDriver): Promise<boolean>
    onRestore(driver: AgentConfigDriver, backupPath: string): Promise<boolean>
    onSave(request: SaveAgentConfigRequest): Promise<boolean>
}

function getErrorLabel(copy: DesktopCopy, error: AgentConfigErrorCode): string {
    if (error === 'hub_unavailable') return copy.agentConfigHubUnavailable
    if (error === 'open_failed') return copy.agentConfigOpenFailed
    if (error === 'restore_failed') return copy.agentConfigRestoreFailed
    if (error === 'save_failed') return copy.agentConfigSaveFailed
    return copy.agentConfigLoadFailed
}

function buildAdvisoryNotice(
    copy: DesktopCopy,
    state: AgentConfigFileState | null
): { title: string; detail: string } | null {
    const advisory = getAgentConfigAdvisory(state)
    if (!advisory) return null
    const installed = advisory.installed ?? copy.agentConfigVersionMissing
    if (advisory.kind === 'outdated') {
        return { title: copy.agentConfigVersionOutdatedTitle, detail: `${installed} → ${advisory.supportedVersion}` }
    }
    return { title: copy.agentConfigVersionMissingTitle, detail: advisory.supportedVersion }
}

export function AgentConfigPanel(props: AgentConfigPanelProps): JSX.Element {
    const [selectedDriver, setSelectedDriver] = useState<AgentConfigDriver>('codex')
    const [draft, setDraft] = useState<AgentConfigDraftByDriver>(() => createAgentConfigDraft(props.response))
    const [savedDriver, setSavedDriver] = useState<AgentConfigDriver | null>(null)
    const fields = useMemo(() => getAgentConfigFields(selectedDriver), [selectedDriver])
    const state = getAgentConfigState(props.response, selectedDriver)
    const changedValues = createAgentConfigPatch(fields, draft[selectedDriver], state?.values)
    const changed = Object.keys(changedValues).length > 0
    const saving = props.savingDriver === selectedDriver
    const restoring = props.restoringDriver === selectedDriver
    const opening = props.openingDriver === selectedDriver
    const latestBackup = state?.backups?.[0] ?? null
    const advisory = buildAdvisoryNotice(props.copy, state)

    useEffect(() => setDraft(createAgentConfigDraft(props.response)), [props.response])

    const updateField = (fieldId: string, value: AgentConfigFieldValue): void => {
        setSavedDriver(null)
        setDraft((current) => updateAgentConfigDraftValue(current, selectedDriver, fieldId, value))
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
            <DesktopSegmentedControl<AgentConfigDriver>
                ariaLabel={props.copy.agentConfigAgentsLabel}
                layoutId="agent-config-driver"
                role="tablist"
                fill
                value={selectedDriver}
                onChange={(value) => setSelectedDriver(value)}
                options={AGENT_CONFIG_VIEW_DRIVERS.map((driver) => {
                    const driverState = getAgentConfigState(props.response, driver)
                    const driverAdvisory =
                        driverState && driverState.version.status !== 'supported' ? (
                            <span aria-label={props.copy.agentConfigVersionAdvisoryShort} />
                        ) : null
                    return { value: driver, label: AGENT_LABELS[driver], badge: driverAdvisory }
                })}
                renderItem={(option) => (
                    <>
                        <AgentBrandIcon driver={option.value} size={18} />
                        <span>{option.label}</span>
                    </>
                )}
            />

            {advisory ? (
                <span className="desktop-agent-config-advisory" role="status">
                    {advisory.title} · {advisory.detail}
                </span>
            ) : null}
            {props.error && props.error !== 'hub_unavailable' ? (
                <div className="desktop-inline-notice is-error">{getErrorLabel(props.copy, props.error)}</div>
            ) : null}
            {state?.error ? <div className="desktop-inline-notice is-warning">{state.error}</div> : null}

            <PresenceSwap switchKey={selectedDriver} className="desktop-agent-config-grid">
                {groupAgentConfigFields(fields).map((group) => (
                    <section key={group.group} className="desktop-agent-config-card">
                        <h3>{agentConfigGroupLabel(group.group, props.language)}</h3>
                        {group.fields.map((field) => (
                            <div key={field.id} className="desktop-agent-config-row">
                                <div>
                                    <strong>{localizeAgentConfigText(field.label, props.language)}</strong>
                                    <span>{localizeAgentConfigText(field.help, props.language)}</span>
                                    <code>{field.path}</code>
                                </div>
                                <AgentConfigFieldControl
                                    copy={props.copy}
                                    disabled={props.loading || saving}
                                    field={field}
                                    language={props.language}
                                    value={draft[selectedDriver][field.id] ?? field.defaultValue ?? null}
                                    onChange={(value) => updateField(field.id, value)}
                                />
                            </div>
                        ))}
                    </section>
                ))}
            </PresenceSwap>

            <div className="desktop-agent-config-savebar">
                <div>
                    <strong>{state?.path ?? props.copy.agentConfigPathPending}</strong>
                    <span>
                        {savedDriver === selectedDriver ? props.copy.agentConfigSaved : props.copy.agentConfigSaveHint}
                    </span>
                </div>
                <div className="desktop-agent-config-savebar-actions">
                    <button
                        type="button"
                        className="is-secondary"
                        disabled={!state || opening || props.loading}
                        onClick={() => void props.onOpen(selectedDriver)}
                    >
                        {opening ? <SpinnerIcon /> : <LinkIcon />}
                        <span>{opening ? props.copy.agentConfigOpening : props.copy.agentConfigOpen}</span>
                    </button>
                    <button
                        type="button"
                        className="is-secondary"
                        disabled={!latestBackup || restoring || props.loading}
                        title={
                            latestBackup
                                ? formatAgentConfigBackupTime(latestBackup.createdAt, props.language)
                                : undefined
                        }
                        onClick={() => void restore()}
                    >
                        {restoring ? <SpinnerIcon /> : null}
                        <span>
                            {restoring
                                ? props.copy.agentConfigRestoring
                                : latestBackup
                                  ? `${props.copy.agentConfigRestoreLabel} · ${formatAgentConfigBackupTime(latestBackup.createdAt, props.language)}`
                                  : props.copy.agentConfigRestoreEmpty}
                        </span>
                    </button>
                    <button type="button" disabled={!changed || saving || props.loading} onClick={() => void save()}>
                        {saving ? <SpinnerIcon /> : null}
                        <span>{saving ? props.copy.agentConfigSaving : props.copy.agentConfigSave}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
