import { joinClassNames } from '@/components/loading/loadingClassName'

type ConnectingProgressRailProps = {
    progress: number
    className?: string
}

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) return 0
    if (value < 0) return 0
    if (value > 1) return 1
    return value
}

export function ConnectingProgressRail(props: ConnectingProgressRailProps): React.JSX.Element {
    const progress = clampProgress(props.progress)
    const filledStyle = { width: `${(progress * 100).toFixed(2)}%` }

    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className={joinClassNames('ds-connecting-rail', props.className)}
        >
            <div className="ds-connecting-rail-fill" style={filledStyle}>
                <div className="ds-connecting-rail-sheen" aria-hidden="true" />
            </div>
        </div>
    )
}
