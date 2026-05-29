import {
    AGENT_FLAVORS,
    type AgentAvailability,
    type AgentAvailabilityCode,
    type AgentConfigDriver,
    type AgentConfigResponse,
    type AgentFlavor,
    getAgentSupportLink,
    type RestoreAgentConfigRequest,
    type RuntimeAgentCapabilitySnapshot,
    type SaveAgentConfigRequest,
} from '@viby/protocol'
import { AnimatePresence, m } from 'motion/react'
import { type JSX, useEffect, useMemo, useState } from 'react'
import { AgentBrandIcon } from '@/components/AgentBrandIcon'
import { AgentConfigPanel } from '@/components/AgentConfigPanel'
import { AgentModelPanel, AgentModelToggle, shouldShowAgentModels } from '@/components/AgentModelDropdown'
import { AGENT_ITEM_MOTION, AgentStatusIcon, AgentStatusText } from '@/components/AgentPresenceMotion'
import { DesktopSegmentedControl } from '@/components/DesktopSegmentedControl'
import { LinkIcon, RefreshIcon, SpinnerIcon } from '@/components/icons'
import { PresenceSwap } from '@/components/motion'
import type { AgentAvailabilityErrorCode } from '@/hooks/useAgentAvailability'
import type { AgentConfigErrorCode } from '@/hooks/useAgentConfig'
import { AGENT_DESCRIPTION_KEYS, AGENT_LABELS } from '@/lib/agentPresentation'
import type { DesktopCopy } from '@/lib/desktopCopy'

const STATUS_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const
type CodingAgentsPageProps = {
    agents: readonly AgentAvailability[]
    capabilities: readonly RuntimeAgentCapabilitySnapshot[]
    configError: AgentConfigErrorCode | null
    configLoading: boolean
    configResponse: AgentConfigResponse | null
    configOpeningDriver: AgentConfigDriver | null
    configRestoringDriver: AgentConfigDriver | null
    configSavingDriver: AgentConfigDriver | null
    copy: DesktopCopy
    error: AgentAvailabilityErrorCode | null
    loading: boolean
    language: 'zh' | 'en'
    refreshing: boolean
    onRestoreAgentConfig(request: RestoreAgentConfigRequest): Promise<boolean>
    onSaveAgentConfig(request: SaveAgentConfigRequest): Promise<boolean>
    onOpenAgentConfig(driver: AgentConfigDriver): Promise<boolean>
    onLoadAgentCapability(driver: AgentFlavor): void
    onOpenUrl(url: string): void
    onRefresh(): void
}
function getStatusLabel(copy: DesktopCopy, status: AgentAvailability['status']): string {
    switch (status) {
        case 'ready':
            return copy.agentReady
        case 'not_installed':
            return copy.agentNotInstalled
        case 'setup_required':
            return copy.agentSetupRequired
        case 'unsupported_platform':
            return copy.agentUnsupported
        case 'unavailable':
            return copy.agentUnavailable
    }
}
function getReasonLabel(copy: DesktopCopy, code: AgentAvailabilityCode): string | null {
    switch (code) {
        case 'command_missing':
            return copy.agentReasonCommandMissing
        case 'auth_missing':
            return copy.agentReasonAuthMissing
        case 'config_missing':
            return copy.agentReasonConfigMissing
        case 'platform_unsupported':
            return copy.agentReasonPlatformUnsupported
        case 'provider_unavailable':
            return copy.agentReasonProviderUnavailable
        case 'unknown':
            return copy.agentReasonUnknown
        case 'ready':
            return null
    }
}
function getErrorLabel(copy: DesktopCopy, error: AgentAvailabilityErrorCode): string {
    return error === 'hub_unavailable' ? copy.agentsHubUnavailable : copy.agentsCheckFailed
}
function getActionLabel(copy: DesktopCopy, resolution: AgentAvailability['resolution']): string {
    switch (resolution) {
        case 'install':
            return copy.agentInstall
        case 'configure':
            return copy.agentConfigure
        case 'learn_more':
            return copy.agentLearnMore
        case 'none':
            return copy.agentReadyAction
    }
}
function getAvailabilityRank(agent: AgentAvailability | null, loading: boolean): number {
    switch (agent?.status) {
        case 'ready':
            return 0
        case 'setup_required':
            return 1
        case undefined:
            return loading ? 2 : 5
        case 'not_installed':
            return 3
        case 'unavailable':
        case 'unsupported_platform':
            return 4
    }
}
function getOrderedDrivers(
    agentsByDriver: ReadonlyMap<AgentFlavor, AgentAvailability>,
    loading: boolean
): AgentFlavor[] {
    return [...AGENT_FLAVORS].sort((left, right) => {
        const rankDelta =
            getAvailabilityRank(agentsByDriver.get(left) ?? null, loading) -
            getAvailabilityRank(agentsByDriver.get(right) ?? null, loading)
        return rankDelta || AGENT_FLAVORS.indexOf(left) - AGENT_FLAVORS.indexOf(right)
    })
}
function getStatusTone(agent: AgentAvailability | null, detecting: boolean): string {
    if (detecting) return 'is-actionable'
    if (!agent) return 'is-muted'
    return agent.status === 'ready' ? 'is-ready' : 'is-actionable'
}
function shouldShowStatus(agent: AgentAvailability | null, detecting: boolean): boolean {
    if (!agent) return detecting
    return agent.status !== 'not_installed'
}
function shouldShowSideReason(agent: AgentAvailability | null, detecting: boolean): boolean {
    return !detecting && agent?.status === 'not_installed'
}
function getSideMode(options: { action: boolean; install: boolean; models: boolean; status: boolean }): string {
    if (options.install) return 'install'
    return [options.models ? 'models' : null, options.action ? 'action' : null, options.status ? 'status' : null]
        .filter(Boolean)
        .join('-')
}
function AgentRow(props: {
    agent: AgentAvailability | null
    capability: RuntimeAgentCapabilitySnapshot | null
    copy: DesktopCopy
    driver: AgentFlavor
    expanded: boolean
    loading: boolean
    onLoadAgentCapability(driver: AgentFlavor): void
    onOpenUrl(url: string): void
    onToggleModels(driver: AgentFlavor): void
}): JSX.Element {
    const driverRefreshing =
        (props.capability?.availability.refreshing ?? false) || (props.capability?.launchConfig.refreshing ?? false)
    const detecting = !props.agent && (props.loading || driverRefreshing)
    const status = props.agent ? getStatusLabel(props.copy, props.agent.status) : props.copy.agentDetecting
    const reason = props.agent ? getReasonLabel(props.copy, props.agent.code) : null
    const description = props.copy[AGENT_DESCRIPTION_KEYS[props.driver]]
    const ready = props.agent?.status === 'ready'
    const href = props.agent ? getAgentSupportLink(props.driver, props.agent.resolution) : null
    const showStatus = shouldShowStatus(props.agent, detecting)
    const showSideReason = shouldShowSideReason(props.agent, detecting)
    const showModels = shouldShowAgentModels(props.agent)
    const showAction = Boolean(href)
    const showInstall = showSideReason && Boolean(reason) && showAction
    const sideMode = getSideMode({ action: showAction, install: showInstall, models: showModels, status: showStatus })

    return (
        <m.div className="desktop-agent-row" role="listitem" layout transition={STATUS_TRANSITION}>
            <div className="desktop-agent-main">
                <AgentBrandIcon driver={props.driver} size={40} />
                <div>
                    <span className="desktop-agent-title-line">
                        <strong>{AGENT_LABELS[props.driver]}</strong>
                        {reason && !showSideReason ? <small>{reason}</small> : null}
                    </span>
                    <span>{description}</span>
                </div>
            </div>
            <div className="desktop-agent-side">
                <AnimatePresence initial={false} mode="wait">
                    <m.div key={sideMode} className="desktop-agent-side-content" {...AGENT_ITEM_MOTION}>
                        {showInstall && reason && href ? (
                            <span className="desktop-agent-install-group">
                                <span className="desktop-agent-side-reason">{reason}</span>
                                <button
                                    type="button"
                                    className="desktop-agent-action"
                                    onClick={() => props.onOpenUrl(href)}
                                >
                                    <LinkIcon />
                                    <span>{getActionLabel(props.copy, props.agent?.resolution ?? 'learn_more')}</span>
                                </button>
                            </span>
                        ) : null}
                        {showModels ? (
                            <span className="desktop-agent-model-toggle-slot">
                                <AgentModelToggle
                                    agent={props.agent}
                                    capability={props.capability}
                                    copy={props.copy}
                                    expanded={props.expanded}
                                    onToggle={() => {
                                        if (!props.expanded) props.onLoadAgentCapability(props.driver)
                                        props.onToggleModels(props.driver)
                                    }}
                                />
                            </span>
                        ) : null}
                        {href && !showSideReason ? (
                            <button
                                type="button"
                                className="desktop-agent-action"
                                onClick={() => props.onOpenUrl(href)}
                            >
                                <LinkIcon />
                                <span>{getActionLabel(props.copy, props.agent?.resolution ?? 'learn_more')}</span>
                            </button>
                        ) : null}
                        {showStatus ? (
                            <span className={`desktop-agent-status ${getStatusTone(props.agent, detecting)}`}>
                                <AgentStatusIcon detecting={detecting} ready={ready} />
                                <AgentStatusText value={status} />
                            </span>
                        ) : null}
                    </m.div>
                </AnimatePresence>
            </div>
            <AgentModelPanel
                agent={props.agent}
                capability={props.capability}
                copy={props.copy}
                expanded={props.expanded}
            />
        </m.div>
    )
}

export function CodingAgentsPage(props: CodingAgentsPageProps): JSX.Element {
    const [expandedDriver, setExpandedDriver] = useState<AgentFlavor | null>(null)
    const [activeView, setActiveView] = useState<'status' | 'config'>('status')
    const agentsByDriver = useMemo(() => new Map(props.agents.map((agent) => [agent.driver, agent])), [props.agents])
    const capabilitiesByDriver = useMemo(
        () => new Map(props.capabilities.map((entry) => [entry.driver, entry])),
        [props.capabilities]
    )
    const orderedDrivers = useMemo(
        () => getOrderedDrivers(agentsByDriver, props.loading),
        [agentsByDriver, props.loading]
    )
    const [displayDrivers, setDisplayDrivers] = useState<AgentFlavor[]>(() => [...AGENT_FLAVORS])
    const hasRuntimeSnapshot = props.agents.length > 0 || props.capabilities.length > 0
    const showRefresh =
        activeView === 'status' &&
        (props.error === 'check_failed' || props.loading || props.refreshing || hasRuntimeSnapshot)
    const toolbarNotice =
        activeView === 'status' && props.error
            ? getErrorLabel(props.copy, props.error)
            : activeView === 'config' && props.configError === 'hub_unavailable'
              ? props.copy.agentConfigHubUnavailable
              : null

    useEffect(() => {
        if (hasRuntimeSnapshot && !props.loading && !props.refreshing) setDisplayDrivers(orderedDrivers)
    }, [hasRuntimeSnapshot, orderedDrivers, props.loading, props.refreshing])

    return (
        <div className="desktop-page desktop-agents-page" aria-busy={props.loading || props.refreshing}>
            <div className="desktop-page-toolbar desktop-agent-toolbar">
                <div className="desktop-agent-toolbar-left">
                    <DesktopSegmentedControl<'status' | 'config'>
                        ariaLabel={props.copy.agentViewSwitchLabel}
                        layoutId="agent-view"
                        role="tablist"
                        value={activeView}
                        onChange={(value) => setActiveView(value)}
                        options={[
                            { value: 'status', label: props.copy.agentStatusTab },
                            { value: 'config', label: props.copy.agentConfigTab },
                        ]}
                    />
                </div>
                <div className="desktop-agent-toolbar-right">
                    <AnimatePresence initial={false}>
                        {toolbarNotice ? (
                            <m.div key="notice" className="desktop-inline-notice is-warning" {...AGENT_ITEM_MOTION}>
                                {toolbarNotice}
                            </m.div>
                        ) : null}
                        {showRefresh ? (
                            <m.button
                                key="refresh"
                                type="button"
                                className="desktop-page-action desktop-agent-refresh"
                                disabled={props.loading}
                                onClick={() => {
                                    setExpandedDriver(null)
                                    props.onRefresh()
                                }}
                                {...AGENT_ITEM_MOTION}
                            >
                                {props.loading || props.refreshing ? <SpinnerIcon /> : <RefreshIcon />}
                                <span>
                                    {props.loading || props.refreshing
                                        ? props.copy.agentsRefreshing
                                        : props.copy.agentsRefresh}
                                </span>
                            </m.button>
                        ) : null}
                    </AnimatePresence>
                </div>
            </div>

            <PresenceSwap switchKey={activeView}>
                {activeView === 'status' ? (
                    <m.div className="desktop-agent-list" role="list" aria-label={props.copy.agentsListLabel} layout>
                        {displayDrivers.map((driver) => (
                            <AgentRow
                                key={driver}
                                agent={agentsByDriver.get(driver) ?? null}
                                capability={capabilitiesByDriver.get(driver) ?? null}
                                copy={props.copy}
                                driver={driver}
                                expanded={expandedDriver === driver}
                                loading={props.loading}
                                onLoadAgentCapability={props.onLoadAgentCapability}
                                onOpenUrl={props.onOpenUrl}
                                onToggleModels={(nextDriver) =>
                                    setExpandedDriver((current) => (current === nextDriver ? null : nextDriver))
                                }
                            />
                        ))}
                    </m.div>
                ) : (
                    <AgentConfigPanel
                        copy={props.copy}
                        error={props.configError}
                        language={props.language}
                        loading={props.configLoading}
                        openingDriver={props.configOpeningDriver}
                        response={props.configResponse}
                        restoringDriver={props.configRestoringDriver}
                        savingDriver={props.configSavingDriver}
                        onRefresh={props.onRefresh}
                        onOpen={props.onOpenAgentConfig}
                        onRestore={(driver, backupPath) => props.onRestoreAgentConfig({ driver, backupPath })}
                        onSave={props.onSaveAgentConfig}
                    />
                )}
            </PresenceSwap>
        </div>
    )
}
