import { memo, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import {
    FeatureFolderIcon as FolderIcon,
    FeatureProjectIcon as ProjectIcon,
    FeatureRefreshIcon as RefreshIcon,
} from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { BackIcon, FolderOpenIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRuntimeDirectoryBrowser } from '@/hooks/queries/useRuntimeDirectoryBrowser'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { RuntimeDirectoryRootKind } from '@/types/api'
import { ProjectPickerControlButton } from './ProjectPickerControlButton'

type ProjectPickerDialogProps = {
    api: ApiClient
    isSupported: boolean
    open: boolean
    selectedPath: string
    recentPaths: string[]
    projectPaths: string[]
    isDisabled: boolean
    onOpenChange: (open: boolean) => void
    onSelectPath: (path: string) => void
}

type PickerListProps = {
    paths: string[]
    isDisabled: boolean
    onSelect: (path: string) => void
}

type DirectoryEntryListProps = {
    entries: Array<{ name: string; path: string }>
    isDisabled: boolean
    onSelect: (path: string) => void
}

const QUICK_PICK_LIMIT = 8
const MAX_ITEM_ANIMATION_DELAY = 0.12
const PATH_ITEM_DELAY_STEP = 0.03
const DIRECTORY_ITEM_DELAY_STEP = 0.02
const CONTROL_BUTTON_CLASS_NAME =
    'h-9 w-9 rounded-full text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] disabled:opacity-40'

function getItemDelay(index: number, step: number): number {
    return Math.min(index * step, MAX_ITEM_ANIMATION_DELAY)
}

function getRootLabel(kind: RuntimeDirectoryRootKind, t: (key: string) => string): string {
    return t(`newSession.projectPicker.root.${kind}`)
}

function PickerPathList(props: PickerListProps): React.JSX.Element | null {
    if (props.paths.length === 0) {
        return null
    }

    return (
        <div className="grid gap-2 sm:grid-cols-2">
            {props.paths.map((path, index) => (
                <BlurFade key={path} delay={getItemDelay(index, PATH_ITEM_DELAY_STEP)} duration={0.18} offset={8}>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onSelect(path)}
                        disabled={props.isDisabled}
                        className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-3 text-left shadow-[var(--ds-shadow-soft)] disabled:opacity-50 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start"
                        title={path}
                    >
                        <ProjectIcon className="h-4 w-4 shrink-0 text-[var(--ds-accent-lime)]" />
                        <span className="truncate text-sm font-medium text-[var(--ds-text-primary)]">{path}</span>
                    </Button>
                </BlurFade>
            ))}
        </div>
    )
}

function PickerDirectoryList(props: DirectoryEntryListProps): React.JSX.Element | null {
    if (props.entries.length === 0) {
        return null
    }

    return (
        <div className="space-y-2">
            {props.entries.map((entry, index) => (
                <BlurFade
                    key={entry.path}
                    delay={getItemDelay(index, DIRECTORY_ITEM_DELAY_STEP)}
                    duration={0.18}
                    offset={8}
                >
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onSelect(entry.path)}
                        disabled={props.isDisabled}
                        className="w-full rounded-xl px-3 py-3 text-left shadow-[var(--ds-shadow-soft)] disabled:opacity-50 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between"
                    >
                        <span className="flex min-w-0 items-center gap-2.5">
                            <FolderIcon className="h-4 w-4 shrink-0 text-[var(--ds-accent-gold)]" />
                            <span className="truncate text-sm font-medium text-[var(--ds-text-primary)]">
                                {entry.name}
                            </span>
                        </span>
                        <FolderOpenIcon className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]" />
                    </Button>
                </BlurFade>
            ))}
        </div>
    )
}

export const ProjectPickerDialog = memo(function ProjectPickerDialog(
    props: ProjectPickerDialogProps
): React.JSX.Element {
    const { t } = useTranslation()
    const quickPaths = useMemo(() => {
        const uniquePaths = new Set<string>()
        for (const path of [...props.recentPaths, ...props.projectPaths]) {
            if (!path.trim()) {
                continue
            }
            uniquePaths.add(path)
            if (uniquePaths.size >= QUICK_PICK_LIMIT) {
                break
            }
        }
        return [...uniquePaths]
    }, [props.projectPaths, props.recentPaths])
    const browser = useRuntimeDirectoryBrowser({
        api: props.api,
        initialPath: props.selectedPath,
        enabled: props.open && props.isSupported,
    })

    function handleSelect(path: string): void {
        props.onSelectPath(path)
        props.onOpenChange(false)
    }

    const canOpenCurrentFolder = browser.hasCurrentDirectory
    const rootButtons =
        browser.roots.length > 0 ? (
            <div className="flex flex-wrap gap-2">
                {browser.roots.map((root) => (
                    <Button
                        key={root.path}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => browser.browseTo(root.path)}
                        disabled={props.isDisabled}
                        className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] disabled:opacity-50"
                    >
                        {getRootLabel(root.kind, t)}
                    </Button>
                ))}
            </div>
        ) : null

    const browserAction = (
        <div className="flex items-center gap-2">
            <ProjectPickerControlButton
                icon={<BackIcon className="h-4 w-4" />}
                label={t('newSession.projectPicker.up')}
                isDisabled={!browser.parentPath || props.isDisabled}
                onClick={() => browser.browseTo(browser.parentPath)}
                className={CONTROL_BUTTON_CLASS_NAME}
            />
            <ProjectPickerControlButton
                icon={<RefreshIcon className={cn('h-4 w-4', browser.isRefreshing ? 'animate-spin' : '')} />}
                label={t('newSession.projectPicker.refresh')}
                isDisabled={props.isDisabled}
                onClick={() => void browser.refresh()}
                className={CONTROL_BUTTON_CLASS_NAME}
            />
        </div>
    )

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="max-w-2xl overflow-hidden p-0">
                <div className="ds-project-picker-dialog-body flex flex-col">
                    <div className="border-b border-[var(--ds-border-subtle)] px-5 py-4">
                        <DialogHeader className="gap-2 text-left">
                            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                                <ProjectIcon className="h-4.5 w-4.5 text-[var(--ds-accent-lime)]" />
                                <span>{t('newSession.projectPicker.title')}</span>
                            </DialogTitle>
                        </DialogHeader>
                        <div className="mt-2 text-xs text-[var(--ds-text-muted)]">
                            {t('newSession.projectPicker.currentPath')}
                        </div>
                        <div className="mt-1 break-all text-sm font-medium text-[var(--ds-text-primary)]">
                            {browser.currentPath || t('newSession.projectPicker.emptyPath')}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        <div className="space-y-4">
                            <BlurFade delay={0.03}>
                                {quickPaths.length > 0 ? (
                                    <section className="space-y-2.5">
                                        <h3 className="ds-metric-label font-semibold text-[var(--ds-text-muted)]">
                                            {t('newSession.projectPicker.quick')}
                                        </h3>
                                        <PickerPathList
                                            paths={quickPaths}
                                            isDisabled={props.isDisabled}
                                            onSelect={handleSelect}
                                        />
                                    </section>
                                ) : null}
                            </BlurFade>

                            <BlurFade delay={0.06}>
                                <section className="space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="ds-metric-label font-semibold text-[var(--ds-text-muted)]">
                                            {t('newSession.projectPicker.folders')}
                                        </h3>
                                        {props.isSupported ? browserAction : null}
                                    </div>

                                    {props.isSupported ? rootButtons : null}

                                    {!props.isSupported ? (
                                        <InlineNotice
                                            tone="warning"
                                            title={t('newSession.projectPicker.unsupported')}
                                            className="px-3 py-2 shadow-none"
                                        />
                                    ) : null}

                                    {browser.error ? (
                                        <InlineNotice
                                            tone="warning"
                                            title={browser.error}
                                            className="px-3 py-2 shadow-none"
                                        />
                                    ) : null}

                                    {props.isSupported && browser.isLoading ? (
                                        <div className="flex min-h-32 items-center justify-center">
                                            <Spinner label={t('newSession.projectPicker.loading')} />
                                        </div>
                                    ) : null}

                                    {props.isSupported && !browser.isLoading && browser.entries.length > 0 ? (
                                        <PickerDirectoryList
                                            entries={browser.entries}
                                            isDisabled={props.isDisabled}
                                            onSelect={browser.browseTo}
                                        />
                                    ) : null}

                                    {props.isSupported &&
                                    !browser.isLoading &&
                                    browser.entries.length === 0 &&
                                    !browser.error ? (
                                        <p className="px-1 text-sm text-[var(--ds-text-muted)]">
                                            {t('newSession.projectPicker.empty')}
                                        </p>
                                    ) : null}
                                </section>
                            </BlurFade>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-[var(--ds-border-subtle)] px-4 py-3">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSelect(browser.currentPath)}
                            disabled={!canOpenCurrentFolder || props.isDisabled}
                        >
                            {t('newSession.projectPicker.useCurrent')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
})
