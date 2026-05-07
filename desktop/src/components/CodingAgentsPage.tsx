import {
    AGENT_FLAVORS,
    type AgentAvailability,
    type AgentAvailabilityCode,
    type AgentFlavor,
    getAgentSupportLink,
    type RuntimeAgentCapabilitySnapshot,
} from '@viby/protocol'
import { AnimatePresence, m } from 'motion/react'
import { type JSX, useMemo, useState } from 'react'
import { AgentModelPanel, AgentModelToggle } from '@/components/AgentModelDropdown'
import { CheckIcon, LinkIcon, RefreshIcon, SpinnerIcon } from '@/components/icons'
import type { AgentAvailabilityErrorCode } from '@/hooks/useAgentAvailability'
import { AGENT_DESCRIPTION_KEYS, AGENT_ICONS, AGENT_LABELS } from '@/lib/agentPresentation'
import type { DesktopCopy } from '@/lib/desktopCopy'

const STATUS_TRANSITION = { type: 'spring', stiffness: 420, damping: 34, mass: 0.72 } as const
const STATUS_TEXT_TRANSITION = { duration: 0.24, ease: [0.22, 1, 0.36, 1] } as const

type CodingAgentsPageProps = {
    agents: readonly AgentAvailability[]
    capabilities: readonly RuntimeAgentCapabilitySnapshot[]
    copy: DesktopCopy
    error: AgentAvailabilityErrorCode | null
    loading: boolean
    refreshing: boolean
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
    const logoClassName = props.driver === 'pi' ? 'is-template' : props.driver
    const showStatus = shouldShowStatus(props.agent, detecting)
    const showSideReason = shouldShowSideReason(props.agent, detecting)

    return (
        <m.div className="desktop-agent-row" role="listitem" layout transition={STATUS_TRANSITION}>
            <div className="desktop-agent-main">
                <span className="desktop-agent-logo">
                    <img className={logoClassName} src={AGENT_ICONS[props.driver]} alt="" />
                </span>
                <div>
                    <span className="desktop-agent-title-line">
                        <strong>{AGENT_LABELS[props.driver]}</strong>
                        {reason && !showSideReason ? <small>{reason}</small> : null}
                    </span>
                    <span>{description}</span>
                </div>
            </div>
            <div className="desktop-agent-side">
                {showSideReason && reason ? <span className="desktop-agent-side-reason">{reason}</span> : null}
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
                {href ? (
                    <m.button
                        type="button"
                        className="desktop-agent-action"
                        layout
                        whileTap={{ scale: 0.985 }}
                        onClick={() => props.onOpenUrl(href)}
                    >
                        <LinkIcon />
                        <span>{getActionLabel(props.copy, props.agent?.resolution ?? 'learn_more')}</span>
                    </m.button>
                ) : null}
                {showStatus ? (
                    <m.span
                        className={`desktop-agent-status ${getStatusTone(props.agent, detecting)}`}
                        layout
                        transition={STATUS_TRANSITION}
                    >
                        <AnimatePresence initial={false}>
                            {detecting || ready ? (
                                <m.span
                                    key={detecting ? 'spinner' : 'ready'}
                                    className="desktop-agent-status-icon"
                                    initial={{ opacity: 0, scale: 0.72, width: 0 }}
                                    animate={{ opacity: 1, scale: 1, width: 18 }}
                                    exit={{ opacity: 0, scale: 0.72, width: 0 }}
                                    transition={STATUS_TEXT_TRANSITION}
                                >
                                    {detecting ? <SpinnerIcon /> : <CheckIcon />}
                                </m.span>
                            ) : null}
                        </AnimatePresence>
                        <AnimatePresence mode="popLayout" initial={false}>
                            <m.span
                                key={status}
                                layout
                                initial={{ opacity: 0, y: 5, filter: 'blur(3px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -5, filter: 'blur(3px)' }}
                                transition={STATUS_TEXT_TRANSITION}
                            >
                                {status}
                            </m.span>
                        </AnimatePresence>
                    </m.span>
                ) : null}
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
    const agentsByDriver = useMemo(() => new Map(props.agents.map((agent) => [agent.driver, agent])), [props.agents])
    const capabilitiesByDriver = useMemo(
        () => new Map(props.capabilities.map((entry) => [entry.driver, entry])),
        [props.capabilities]
    )
    const orderedDrivers = useMemo(
        () => getOrderedDrivers(agentsByDriver, props.loading),
        [agentsByDriver, props.loading]
    )

    return (
        <div className="desktop-page desktop-agents-page" aria-busy={props.loading || props.refreshing}>
            <div className="desktop-page-toolbar desktop-agent-toolbar">
                {props.error ? (
                    <div className="desktop-inline-notice is-error">{getErrorLabel(props.copy, props.error)}</div>
                ) : null}
                <button
                    type="button"
                    className="desktop-page-action desktop-agent-refresh"
                    disabled={props.loading}
                    onClick={() => {
                        setExpandedDriver(null)
                        props.onRefresh()
                    }}
                >
                    {props.loading || props.refreshing ? <SpinnerIcon /> : <RefreshIcon />}
                    <span>
                        {props.loading || props.refreshing ? props.copy.agentsRefreshing : props.copy.agentsRefresh}
                    </span>
                </button>
            </div>

            <div className="desktop-agent-list" role="list" aria-label={props.copy.agentsListLabel}>
                {orderedDrivers.map((driver) => (
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
            </div>
        </div>
    )
}
