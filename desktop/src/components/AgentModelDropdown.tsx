import type { AgentAvailability, RuntimeAgentCapabilitySnapshot } from '@viby/protocol'
import { AnimatePresence, m } from 'motion/react'
import { type JSX, type RefObject, useLayoutEffect, useRef, useState } from 'react'
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

function useMeasuredHeight(active: boolean): [RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement | null>(null)
    const [height, setHeight] = useState(0)

    useLayoutEffect(() => {
        if (!active || !ref.current) return
        const element = ref.current
        const update = (): void => {
            const nextHeight = element.scrollHeight
            setHeight((current) => (current === nextHeight ? current : nextHeight))
        }
        update()
        const frame = window.requestAnimationFrame(update)
        if (typeof ResizeObserver === 'undefined') return () => window.cancelAnimationFrame(frame)
        const observer = new ResizeObserver(update)
        observer.observe(element)
        for (const child of element.children) observer.observe(child)
        return () => {
            window.cancelAnimationFrame(frame)
            observer.disconnect()
        }
    })

    return [ref, height]
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
    const [contentRef, measuredHeight] = useMeasuredHeight(props.expanded)

    return (
        <AnimatePresence initial={false}>
            {props.expanded ? (
                <m.div
                    className="desktop-agent-model-panel-shell"
                    initial={{ opacity: 0, height: 0, marginTop: 0, y: -4 }}
                    animate={{ opacity: 1, height: measuredHeight, marginTop: 12, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0, y: -4 }}
                    transition={PANEL_TRANSITION}
                >
                    <div ref={contentRef} className="desktop-agent-model-panel">
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
            {props.config.availableModels.map((model, index) => (
                <span
                    key={model.id}
                    className={index === 0 ? 'desktop-agent-model-item is-default' : 'desktop-agent-model-item'}
                >
                    <ModelIcon />
                    <span>
                        <strong>{index === 0 ? props.copy.agentDefaultModelLabel : model.label || model.id}</strong>
                        <small>
                            {index === 0 ? `${model.label || model.id} · ` : null}
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
