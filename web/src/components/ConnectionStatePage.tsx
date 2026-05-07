import type { ReactNode } from 'react'
import { LoadingRail } from '@/components/loading/LoadingSkeleton'
import { joinClassNames } from '@/components/loading/loadingClassName'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'

const CONNECTION_BRAND_MARK_CLASS_NAME = `ds-connection-brand-mark ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`

type ConnectionStatePanelProps = {
    actions?: ReactNode
    busy?: boolean
    children?: ReactNode
    className?: string
    description?: string
    eyebrow?: string
    title: string
}

type ConnectionStatePageProps = ConnectionStatePanelProps

export function ConnectionStatePanel(props: ConnectionStatePanelProps): React.JSX.Element {
    const statusProps = props.busy ? ({ role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const) : {}

    return (
        <section className={joinClassNames('ds-connection-panel', props.className)} {...statusProps}>
            <StageBrandMark className={CONNECTION_BRAND_MARK_CLASS_NAME} markClassName="ds-connection-brand-glyph" />
            <div className="ds-connection-copy">
                {props.eyebrow ? <p className="ds-connection-eyebrow">{props.eyebrow}</p> : null}
                <h1 className="ds-connection-title">{props.title}</h1>
                {props.description ? <p className="ds-connection-description">{props.description}</p> : null}
            </div>
            {props.children}
            {props.busy ? <LoadingRail className="ds-connection-rail" /> : null}
            {props.actions ? <div className="ds-connection-actions">{props.actions}</div> : null}
        </section>
    )
}

export function ConnectionStatePage(props: ConnectionStatePageProps): React.JSX.Element {
    return (
        <main className="ds-connection-page">
            <ConnectionStatePanel {...props} />
        </main>
    )
}
