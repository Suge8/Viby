import { AGENT_FLAVORS, type AgentAvailability, type AgentFlavor, getAgentSupportLink } from '@viby/protocol'
import type { JSX } from 'react'
import { ChevronIcon, RefreshIcon, SpinnerIcon } from '@/components/icons'
import { StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopCopy } from '@/lib/desktopCopy'

const AGENT_LABELS = {
    claude: 'Claude Code',
    codex: 'Codex CLI',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    cursor: 'Cursor',
    pi: 'Pi',
    copilot: 'GitHub Copilot',
} as const satisfies Record<AgentFlavor, string>

const AGENT_ICONS = {
    claude: '/agent-claude.png',
    codex: '/agent-codex.png',
    gemini: '/agent-gemini.svg',
    opencode: '/agent-opencode.png',
    cursor: '/agent-cursor.ico',
    pi: '/agent-pi.svg',
    copilot: '/agent-copilot.svg',
} as const satisfies Record<AgentFlavor, string>

type CodingAgentsPageProps = {
    agents: readonly AgentAvailability[]
    copy: DesktopCopy
    error: string | null
    loading: boolean
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

function getAgent(agents: readonly AgentAvailability[], driver: AgentFlavor): AgentAvailability | null {
    return agents.find((agent) => agent.driver === driver) ?? null
}

function getStatusTone(agent: AgentAvailability | null): string {
    if (!agent) {
        return 'is-muted'
    }
    return agent.status === 'ready' ? 'is-ready' : 'is-actionable'
}

function AgentRow(props: { agent: AgentAvailability | null; copy: DesktopCopy; driver: AgentFlavor }): JSX.Element {
    const status = props.agent ? getStatusLabel(props.copy, props.agent.status) : props.copy.agentWaiting
    const href = props.agent ? getAgentSupportLink(props.driver, props.agent.resolution) : null
    const logoClassName = props.driver === 'pi' ? 'is-template' : undefined

    return (
        <StaggerItem className="desktop-agent-row" role="listitem">
            <div className="desktop-agent-main">
                <span className="desktop-agent-logo">
                    <img className={logoClassName} src={AGENT_ICONS[props.driver]} alt="" />
                </span>
                <div>
                    <strong>{AGENT_LABELS[props.driver]}</strong>
                    {props.agent?.reason ? <span>{props.agent.reason}</span> : null}
                </div>
            </div>
            <div className="desktop-agent-side">
                <span className={`desktop-agent-status ${getStatusTone(props.agent)}`}>{status}</span>
                {href ? (
                    <a className="desktop-agent-action" href={href} target="_blank" rel="noreferrer">
                        <span>{getActionLabel(props.copy, props.agent?.resolution ?? 'learn_more')}</span>
                        <ChevronIcon />
                    </a>
                ) : null}
            </div>
        </StaggerItem>
    )
}

export function CodingAgentsPage(props: CodingAgentsPageProps): JSX.Element {
    return (
        <div className="desktop-page">
            <div className="desktop-page-toolbar">
                <span>{props.copy.agentsTitle}</span>
                <button
                    type="button"
                    className="desktop-page-action"
                    disabled={props.loading}
                    onClick={props.onRefresh}
                >
                    {props.loading ? <SpinnerIcon /> : <RefreshIcon />}
                    <span>{props.loading ? props.copy.agentsRefreshing : props.copy.agentsRefresh}</span>
                </button>
            </div>

            {props.error ? <div className="desktop-inline-notice is-error">{props.error}</div> : null}

            <div role="list" aria-label={props.copy.agentsListLabel}>
                <StaggerGroup className="desktop-agent-list" stagger={0.05}>
                    {AGENT_FLAVORS.map((driver) => (
                        <AgentRow
                            key={driver}
                            agent={getAgent(props.agents, driver)}
                            copy={props.copy}
                            driver={driver}
                        />
                    ))}
                </StaggerGroup>
            </div>
        </div>
    )
}
