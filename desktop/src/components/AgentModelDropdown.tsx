import type { AgentAvailability, RuntimeAgentCapabilitySnapshot } from '@viby/protocol'
import { AnimatePresence, m } from 'motion/react'
import { type JSX } from 'react'
import { ModelIcon, SpinnerIcon, ThinkingIcon } from '@/components/icons'
import type { DesktopCopy } from '@/lib/desktopCopy'

const PANEL_TRANSITION = { duration: 0.26, ease: [0.22, 1, 0.36, 1] } as const
const THINKING_LEVEL_LIMIT = 4

type AgentModelBaseProps = {
    agent: AgentAvailability | null
    capability: RuntimeAgentCapabilitySnapshot | null
    copy: DesktopCopy
    expanded: boolean
}

type AgentModelToggleProps = AgentModelBaseProps & {
    onToggle(): void
}

type LaunchConfig = NonNullable<RuntimeAgentCapabilitySnapshot['launchConfig']['config']>

function getConfig(capability: RuntimeAgentCapabilitySnapshot | null): LaunchConfig | null {
    return capability?.launchConfig.config ?? null
}

function getThinkingLabel(levels: readonly string[]): string {
    const visible = levels.filter((level) => level !== 'none').slice(0, THINKING_LEVEL_LIMIT)
    return visible.length > 0 ? visible.join('/') : 'none'
}

export function shouldShowAgentModels(agent: AgentAvailability | null): boolean {
    return agent?.status === 'ready'
}

export function AgentModelToggle(props: AgentModelToggleProps): JSX.Element | null {
    if (!shouldShowAgentModels(props.agent)) return null
    const refreshing = props.capability?.launchConfig.refreshing === true
    return (
        <m.button
            type="button"
            className="desktop-agent-model-toggle"
            aria-expanded={props.expanded}
            layout
            whileTap={{ scale: 0.985 }}
            onClick={props.onToggle}
        >
            <span className="desktop-agent-model-toggle-main">
                {refreshing ? <SpinnerIcon /> : <ModelIcon />}
                <span>{props.copy.agentModelsAction}</span>
            </span>
        </m.button>
    )
}

export function AgentModelPanel(props: AgentModelBaseProps): JSX.Element | null {
    if (!shouldShowAgentModels(props.agent)) return null
    const config = getConfig(props.capability)
    const refreshing = props.capability?.launchConfig.refreshing === true
    const error = props.capability?.launchConfig.error

    return (
        <AnimatePresence initial={false}>
            {props.expanded ? (
                <m.div
                    className="desktop-agent-model-panel-shell"
                    initial={{ opacity: 0, gridTemplateRows: '0fr', marginTop: 0, y: -4 }}
                    animate={{ opacity: 1, gridTemplateRows: '1fr', marginTop: 12, y: 0 }}
                    exit={{ opacity: 0, gridTemplateRows: '0fr', marginTop: 0, y: -4 }}
                    transition={PANEL_TRANSITION}
                >
                    <div className="desktop-agent-model-panel">
                        {config ? <ModelList config={config} copy={props.copy} /> : null}
                        {!config && (refreshing || !error) ? (
                            <span className="desktop-agent-model-empty">{props.copy.agentModelsLoading}</span>
                        ) : null}
                        {!config && error ? (
                            <span className="desktop-agent-model-empty">{props.copy.agentModelsUnavailable}</span>
                        ) : null}
                    </div>
                </m.div>
            ) : null}
        </AnimatePresence>
    )
}

function ModelList(props: { config: LaunchConfig; copy: DesktopCopy }): JSX.Element {
    return (
        <div className="desktop-agent-model-grid">
            {props.config.defaultModel ? (
                <span className="desktop-agent-model-item is-default">
                    <ModelIcon />
                    <span>
                        <strong>{props.copy.agentDefaultModelLabel}</strong>
                        <small>{props.config.defaultModel}</small>
                    </span>
                </span>
            ) : null}
            {props.config.availableModels.map((model) => (
                <span key={model.id} className="desktop-agent-model-item">
                    <ModelIcon />
                    <span>
                        <strong>{model.label || model.id}</strong>
                        <small>
                            <ThinkingIcon />
                            {getThinkingLabel(model.supportedThinkingLevels)}
                        </small>
                    </span>
                </span>
            ))}
            {props.config.availableModels.length === 0 ? (
                <span className="desktop-agent-model-empty">{props.copy.agentModelsUnavailable}</span>
            ) : null}
        </div>
    )
}
