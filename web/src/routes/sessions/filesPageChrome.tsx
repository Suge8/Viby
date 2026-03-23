import type { ReactNode } from 'react'
import { GitBranchIcon, RefreshIcon, SearchIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

type FilesActionButtonProps = {
    onClick: () => void
    title: string
}

export function FilesActionButton(props: FilesActionButtonProps): ReactNode {
    return (
        <Button
            type="button"
            variant="plain"
            size="iconSm"
            onClick={props.onClick}
            className="h-8 w-8 rounded-full text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
            title={props.title}
        >
            <RefreshIcon />
        </Button>
    )
}

type FilesSearchBarProps = {
    onChange: (value: string) => void
    placeholder: string
    value: string
}

export function FilesSearchBar(props: FilesSearchBarProps): ReactNode {
    return (
        <div className="bg-[var(--app-bg)]">
            <div className="mx-auto w-full ds-stage-shell border-b border-[var(--app-border)] p-3">
                <div className="flex items-center gap-2 rounded-md bg-[var(--app-subtle-bg)] px-3 py-2">
                    <SearchIcon className="text-[var(--app-hint)]" />
                    <input
                        value={props.value}
                        onChange={(event) => props.onChange(event.target.value)}
                        placeholder={props.placeholder}
                        className="w-full bg-transparent text-sm text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:outline-none"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                </div>
            </div>
        </div>
    )
}

type GitSummaryProps = {
    branchLabel: string
    summaryText: string
}

export function GitSummary(props: GitSummaryProps): ReactNode {
    return (
        <div className="bg-[var(--app-bg)]">
            <div className="mx-auto w-full ds-stage-shell border-b border-[var(--app-divider)] px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                    <GitBranchIcon className="text-[var(--app-hint)]" />
                    <span className="font-semibold">{props.branchLabel}</span>
                </div>
                <div className="text-xs text-[var(--app-hint)]">{props.summaryText}</div>
            </div>
        </div>
    )
}
