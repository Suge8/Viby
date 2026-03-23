import { type CSSProperties, type ReactNode } from 'react'
import { SkeletonRows, type SkeletonRow } from '@/components/loading/LoadingSkeleton'

const FILE_CONTENT_SKELETON_ROWS: ReadonlyArray<SkeletonRow> = [
    { widthClassName: 'w-full', heightClassName: 'h-3' },
    { widthClassName: 'w-11/12', heightClassName: 'h-3' },
    { widthClassName: 'w-5/6', heightClassName: 'h-3' },
    { widthClassName: 'w-3/4', heightClassName: 'h-3' },
    { widthClassName: 'w-2/3', heightClassName: 'h-3' },
    { widthClassName: 'w-4/5', heightClassName: 'h-3' },
    { widthClassName: 'w-full', heightClassName: 'h-3' },
    { widthClassName: 'w-11/12', heightClassName: 'h-3' },
    { widthClassName: 'w-5/6', heightClassName: 'h-3' },
    { widthClassName: 'w-3/4', heightClassName: 'h-3' },
    { widthClassName: 'w-2/3', heightClassName: 'h-3' },
    { widthClassName: 'w-4/5', heightClassName: 'h-3' },
] as const

type DiffDisplayProps = {
    diffContent: string
}

function getDiffLinePresentation(line: string): { className: string; style?: CSSProperties } {
    const isAdd = line.startsWith('+') && !line.startsWith('+++')
    const isRemove = line.startsWith('-') && !line.startsWith('---')
    const isHunk = line.startsWith('@@')
    const isHeader = line.startsWith('+++') || line.startsWith('---')

    const className = [
        'whitespace-pre-wrap px-3 py-0.5 text-xs font-mono',
        isAdd ? 'bg-[var(--app-diff-added-bg)] text-[var(--app-diff-added-text)]' : '',
        isRemove ? 'bg-[var(--app-diff-removed-bg)] text-[var(--app-diff-removed-text)]' : '',
        isHunk ? 'bg-[var(--app-subtle-bg)] text-[var(--app-hint)] font-semibold' : '',
        isHeader ? 'text-[var(--app-hint)] font-semibold' : '',
    ].filter(Boolean).join(' ')

    if (isAdd) {
        return {
            className,
            style: { borderLeft: '2px solid var(--app-git-staged-color)' },
        }
    }

    if (isRemove) {
        return {
            className,
            style: { borderLeft: '2px solid var(--app-git-deleted-color)' },
        }
    }

    return { className }
}

export function DiffDisplay(props: DiffDisplayProps): ReactNode {
    return (
        <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-bg)]">
            {props.diffContent.split('\n').map((line, index) => {
                const presentation = getDiffLinePresentation(line)
                return (
                    <div
                        key={`${index}-${line}`}
                        className={presentation.className}
                        style={presentation.style}
                    >
                        {line || ' '}
                    </div>
                )
            })}
        </div>
    )
}

type FileContentSkeletonProps = {
    label: string
}

export function FileContentSkeleton(props: FileContentSkeletonProps): ReactNode {
    return (
        <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-code-bg)] p-3">
            <SkeletonRows
                label={props.label}
                rows={FILE_CONTENT_SKELETON_ROWS}
                className="space-y-2"
            />
        </div>
    )
}
