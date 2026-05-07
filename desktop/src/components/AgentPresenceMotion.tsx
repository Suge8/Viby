import { AnimatePresence, m } from 'motion/react'
import type { JSX } from 'react'
import { CheckIcon, SpinnerIcon } from '@/components/icons'

export const AGENT_ITEM_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const
export const AGENT_ITEM_MOTION = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: AGENT_ITEM_TRANSITION,
} as const

export function AgentStatusIcon(props: { detecting: boolean; ready: boolean }): JSX.Element {
    const key = props.detecting ? 'detecting' : props.ready ? 'ready' : 'empty'
    return (
        <span className="desktop-agent-status-icon">
            <AnimatePresence initial={false} mode="popLayout">
                <m.span key={key} {...AGENT_ITEM_MOTION}>
                    {props.detecting ? <SpinnerIcon /> : props.ready ? <CheckIcon /> : null}
                </m.span>
            </AnimatePresence>
        </span>
    )
}

export function AgentStatusText(props: { value: string }): JSX.Element {
    return (
        <span className="desktop-agent-status-text">
            <AnimatePresence initial={false} mode="popLayout">
                <m.span key={props.value} {...AGENT_ITEM_MOTION}>
                    {props.value}
                </m.span>
            </AnimatePresence>
        </span>
    )
}
