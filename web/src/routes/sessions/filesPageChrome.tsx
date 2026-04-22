import type { ReactNode } from 'react'
import {
    FeatureGitBranchIcon as GitBranchIcon,
    FeatureRefreshIcon as RefreshIcon,
    FeatureSearchIcon as SearchIcon,
} from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { Input } from '@/components/ui/input'

type FilesActionButtonProps = {
    onClick: () => void
    title: string
}

export function FilesActionButton(props: FilesActionButtonProps): ReactNode {
    return (
        <Button
            type="button"
            variant="secondary"
            size="iconXs"
            onClick={props.onClick}
            className={ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}
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
                    <Input
                        value={props.value}
                        onChange={(event) => props.onChange(event.target.value)}
                        placeholder={props.placeholder}
                        className="min-h-0 border-0 bg-transparent px-0 py-0 shadow-none focus:border-transparent focus:ring-0"
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
