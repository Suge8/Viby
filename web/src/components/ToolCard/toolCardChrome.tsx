import { type ReactNode, useEffect, useState } from 'react'
import type { ToolCallBlock } from '@/chat/types'
import { FeatureRefreshIcon as RefreshIcon } from '@/components/featureIcons'
import { ChevronIcon, ErrorIcon, LockIcon, SuccessIcon } from '@/components/icons'
import { truncate } from '@/lib/toolInputUtils'
import { TOOL_SUBTITLE_TRUNCATE_LENGTH } from './toolCardRenderers'

const ELAPSED_INTERVAL_MS = 1000

export function ElapsedView(props: { from: number; active: boolean }) {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (!props.active) {
            return
        }
        const id = setInterval(() => setNow(Date.now()), ELAPSED_INTERVAL_MS)
        return () => clearInterval(id)
    }, [props.active])

    if (!props.active) {
        return null
    }

    const elapsed = (now - props.from) / 1000
    if (!Number.isFinite(elapsed)) {
        return null
    }

    return <span className="font-mono text-xs text-[var(--app-hint)]">{elapsed.toFixed(1)}s</span>
}

export function StatusIcon(props: { state: ToolCallBlock['tool']['state'] }) {
    if (props.state === 'completed') {
        return <SuccessIcon className="h-3.5 w-3.5" strokeWidth={2.1} />
    }
    if (props.state === 'error') {
        return <ErrorIcon className="h-3.5 w-3.5" strokeWidth={2.1} />
    }
    if (props.state === 'pending') {
        return <LockIcon className="h-3.5 w-3.5" strokeWidth={2.05} />
    }
    return <RefreshIcon className="h-3.5 w-3.5 animate-spin" strokeWidth={2.1} />
}

export function statusColorClass(state: ToolCallBlock['tool']['state']): string {
    if (state === 'completed') {
        return 'text-[var(--ds-success)]'
    }
    if (state === 'error') {
        return 'text-[var(--ds-danger)]'
    }
    if (state === 'pending') {
        return 'text-[var(--ds-warning)]'
    }
    return 'text-[var(--app-hint)]'
}

export function ToolCardHeader(props: {
    icon: ReactNode
    toolTitle: string
    subtitle: string | undefined
    runningFrom: number
    state: ToolCallBlock['tool']['state']
}): ReactNode {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                    <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center leading-none text-[var(--app-hint)]">
                        {props.icon}
                    </div>
                    <h3 className="min-w-0 text-sm font-medium leading-tight break-words">{props.toolTitle}</h3>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <ElapsedView from={props.runningFrom} active={props.state === 'running'} />
                    <span className={statusColorClass(props.state)}>
                        <StatusIcon state={props.state} />
                    </span>
                    <span className="text-[var(--app-hint)]">
                        <ChevronIcon collapsed className="h-4 w-4" />
                    </span>
                </div>
            </div>

            {props.subtitle ? (
                <p className="font-mono text-xs break-all text-[var(--app-hint)] opacity-80">
                    {truncate(props.subtitle, TOOL_SUBTITLE_TRUNCATE_LENGTH)}
                </p>
            ) : null}
        </div>
    )
}
