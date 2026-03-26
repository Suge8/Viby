import { memo, type ReactNode } from 'react'
import { PlainCodeContent } from '@/components/code-block/PlainCodeContent'
import { CodeSurface } from '@/components/code-block/CodeSurface'
import type { FileSearchItem, GitFileStatus } from '@/types/api'
import { FileIcon } from '@/components/FileIcon'
import { FeatureFolderIcon as FolderIcon } from '@/components/featureIcons'
import { SkeletonList, SkeletonRows, type SkeletonRow } from '@/components/loading/LoadingSkeleton'
import { Button } from '@/components/ui/button'

const FILE_LIST_SKELETON_ROWS = [
    { titleWidthClassName: 'w-1/3', subtitleWidthClassName: 'w-1/2' },
    { titleWidthClassName: 'w-1/2', subtitleWidthClassName: 'w-2/3' },
    { titleWidthClassName: 'w-2/3', subtitleWidthClassName: 'w-3/4' },
    { titleWidthClassName: 'w-2/5', subtitleWidthClassName: 'w-1/3' },
    { titleWidthClassName: 'w-3/5', subtitleWidthClassName: 'w-1/2' },
    { titleWidthClassName: 'w-1/2', subtitleWidthClassName: 'w-2/3' },
] as const

const FILE_CONTENT_SKELETON_ROWS: readonly SkeletonRow[] = [
    { widthClassName: 'w-full', heightClassName: 'h-5' },
    { widthClassName: 'w-5/6', heightClassName: 'h-5' },
    { widthClassName: 'w-11/12', heightClassName: 'h-5' },
    { widthClassName: 'w-3/4', heightClassName: 'h-5' },
    { widthClassName: 'w-4/5', heightClassName: 'h-5' },
] as const

function StatusBadge(props: { status: GitFileStatus['status'] }): ReactNode {
    let label = 'M'
    let color = 'var(--app-git-unstaged-color)'

    switch (props.status) {
        case 'added':
            label = 'A'
            color = 'var(--app-git-staged-color)'
            break
        case 'deleted':
            label = 'D'
            color = 'var(--app-git-deleted-color)'
            break
        case 'renamed':
            label = 'R'
            color = 'var(--app-git-renamed-color)'
            break
        case 'untracked':
            label = '?'
            color = 'var(--app-git-untracked-color)'
            break
        case 'conflicted':
            label = 'U'
            color = 'var(--app-git-deleted-color)'
            break
    }

    return (
        <span
            className="inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ color, borderColor: color }}
        >
            {label}
        </span>
    )
}

function LineChanges(props: { added: number; removed: number }): ReactNode {
    if (!props.added && !props.removed) {
        return null
    }

    return (
        <span className="flex items-center gap-1 text-[11px] font-mono">
            {props.added ? <span className="text-[var(--app-diff-added-text)]">+{props.added}</span> : null}
            {props.removed ? <span className="text-[var(--app-diff-removed-text)]">-{props.removed}</span> : null}
        </span>
    )
}

type FileListRowProps = {
    icon: ReactNode
    onOpen: () => void
    showDivider: boolean
    subtitle: string
    title: string
    trailing?: ReactNode
}

const FileListRow = memo(function FileListRow(props: FileListRowProps): ReactNode {
    return (
        <Button
            type="button"
            variant="plain"
            size="sm"
            onClick={props.onOpen}
            className={`w-full gap-3 px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)] [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start ${props.showDivider ? 'border-b border-[var(--app-divider)]' : ''}`}
        >
            {props.icon}
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{props.title}</div>
                <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div>
            </div>
            {props.trailing ? <div className="flex items-center gap-2">{props.trailing}</div> : null}
        </Button>
    )
})

type GitFileRowProps = {
    file: GitFileStatus
    onOpen: () => void
    rootLabel: string
    showDivider: boolean
}

export const GitFileRow = memo(function GitFileRow(props: GitFileRowProps): ReactNode {
    return (
        <FileListRow
            icon={<FileIcon fileName={props.file.fileName} size={22} />}
            onOpen={props.onOpen}
            showDivider={props.showDivider}
            subtitle={props.file.filePath || props.rootLabel}
            title={props.file.fileName}
            trailing={
                <>
                    <LineChanges added={props.file.linesAdded} removed={props.file.linesRemoved} />
                    <StatusBadge status={props.file.status} />
                </>
            }
        />
    )
})

type SearchResultRowProps = {
    file: FileSearchItem
    onOpen: () => void
    rootLabel: string
    showDivider: boolean
}

export const SearchResultRow = memo(function SearchResultRow(props: SearchResultRowProps): ReactNode {
    const icon = props.file.fileType === 'file'
        ? <FileIcon fileName={props.file.fileName} size={22} />
        : <FolderIcon className="h-[22px] w-[22px] text-[var(--ds-accent-coral)]" />

    return (
        <FileListRow
            icon={icon}
            onOpen={props.onOpen}
            showDivider={props.showDivider}
            subtitle={props.file.filePath || props.rootLabel}
            title={props.file.fileName}
        />
    )
})

type FileListSectionHeaderProps = {
    count: number
    label: string
    toneClassName: string
}

export function FileListSectionHeader(props: FileListSectionHeaderProps): ReactNode {
    return (
        <div className={`border-b border-[var(--app-divider)] bg-[var(--app-bg)] px-3 py-2 text-xs font-semibold ${props.toneClassName}`}>
            {props.label} ({props.count})
        </div>
    )
}

type FileListSkeletonProps = {
    label: string
    rows?: number
}

export function FileListSkeleton(props: FileListSkeletonProps): ReactNode {
    const rows = Array.from({ length: props.rows ?? FILE_LIST_SKELETON_ROWS.length }, (_, index) => {
        return FILE_LIST_SKELETON_ROWS[index % FILE_LIST_SKELETON_ROWS.length]
    })

    return (
        <SkeletonList label={props.label} rows={rows} />
    )
}

type FileContentSkeletonProps = {
    label: string
}

export function FileContentSkeleton(props: FileContentSkeletonProps): ReactNode {
    return (
        <div className="rounded-md border border-[var(--app-divider)] p-3">
            <SkeletonRows label={props.label} rows={FILE_CONTENT_SKELETON_ROWS} />
        </div>
    )
}

type PlainFileContentProps = {
    content: string
}

export function PlainFileContent(props: PlainFileContentProps): ReactNode {
    return (
        <CodeSurface preClassName="p-2 pr-8 text-xs">
            <PlainCodeContent code={props.content} />
        </CodeSurface>
    )
}
