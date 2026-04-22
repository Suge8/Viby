import { joinClassNames } from '@/components/loading/loadingClassName'

const SKELETON_TONE_CLASS_NAME = 'bg-[color-mix(in_srgb,var(--app-subtle-bg)_88%,var(--ds-panel-strong)_12%)]'

export type SkeletonRow = {
    align?: 'start' | 'end'
    widthClassName: string
    heightClassName: string
    className?: string
}

type SkeletonBlockProps = {
    className?: string
}

export function SkeletonBlock(props: SkeletonBlockProps): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className={joinClassNames(
                'ds-loading-shimmer rounded-[var(--ds-radius-md)]',
                SKELETON_TONE_CLASS_NAME,
                props.className
            )}
        />
    )
}

type SkeletonRowsProps = {
    label?: string
    rows: ReadonlyArray<SkeletonRow>
    className?: string
}

export function SkeletonRows(props: SkeletonRowsProps): React.JSX.Element {
    return (
        <div className={joinClassNames('space-y-3', props.className)} role="status" aria-live="polite" aria-busy="true">
            {props.label ? <span className="sr-only">{props.label}</span> : null}
            {props.rows.map((row, index) => (
                <div
                    key={`skeleton-row-${index}`}
                    className={row.align === 'end' ? 'flex justify-end' : 'flex justify-start'}
                >
                    <SkeletonBlock className={joinClassNames(row.heightClassName, row.widthClassName, row.className)} />
                </div>
            ))}
        </div>
    )
}

type LoadingRailProps = {
    className?: string
}

export function LoadingRail(props: LoadingRailProps): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className={joinClassNames(
                'h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-hint)_16%,transparent)]',
                props.className
            )}
        >
            <div className="ds-loading-shimmer h-full w-20 rounded-full bg-[color-mix(in_srgb,var(--ds-brand)_18%,transparent)]" />
        </div>
    )
}

type SkeletonListRow = {
    titleWidthClassName: string
    subtitleWidthClassName: string
}

type SkeletonListProps = {
    label: string
    rows: ReadonlyArray<SkeletonListRow>
    className?: string
    iconClassName?: string
}

export function SkeletonList(props: SkeletonListProps): React.JSX.Element {
    return (
        <div
            className={joinClassNames('space-y-3 p-3', props.className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="sr-only">{props.label}</span>
            {props.rows.map((row, index) => (
                <div key={`skeleton-list-row-${index}`} className="flex items-center gap-3">
                    <SkeletonBlock className={joinClassNames('ds-loading-list-icon h-6 w-6', props.iconClassName)} />
                    <div className="flex-1 space-y-2">
                        <SkeletonBlock className={joinClassNames('h-3', row.titleWidthClassName)} />
                        <SkeletonBlock className={joinClassNames('h-2', row.subtitleWidthClassName)} />
                    </div>
                </div>
            ))}
        </div>
    )
}
