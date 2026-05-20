import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import {
    FeatureCloseIcon as CloseIcon,
    FeatureProjectIcon as ProjectIcon,
    FeatureRefreshIcon as RefreshIcon,
} from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRuntimeDirectoryBrowser } from '@/hooks/queries/useRuntimeDirectoryBrowser'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import { ProjectPickerControlButton } from './ProjectPickerControlButton'
import {
    PROJECT_PICKER_CHIP_CLASS_NAME,
    ProjectPickerChipStrip,
    ProjectPickerDirectorySkeleton,
    ProjectPickerNavigationBar,
} from './ProjectPickerDialogViews'
import { ProjectPickerDirectoryList } from './ProjectPickerDirectoryList'

type ProjectPickerDialogProps = {
    api: ApiClient
    isSupported: boolean
    open: boolean
    selectedPath: string
    workspaceRoot?: string | null
    recentPaths: string[]
    projectPaths: string[]
    isDisabled: boolean
    onOpenChange: (open: boolean) => void
    onSelectPath: (path: string) => void
}

const QUICK_PICK_LIMIT = 8

function isHiddenDirectoryName(name: string): boolean {
    return name.startsWith('.')
}

export const ProjectPickerDialog = memo(function ProjectPickerDialog(
    props: ProjectPickerDialogProps
): React.JSX.Element {
    const { t } = useTranslation()
    const listRef = useRef<HTMLDivElement | null>(null)
    const scrollPositionsRef = useRef(new Map<string, number>())
    const pendingScrollTopRef = useRef<number | null>(null)
    const [showHidden, setShowHidden] = useState(false)
    const quickPaths = useMemo(() => {
        const uniquePaths = new Set<string>()
        for (const path of [...props.recentPaths, ...props.projectPaths]) {
            const trimmed = path.trim()
            if (!trimmed) continue
            uniquePaths.add(trimmed)
            if (uniquePaths.size >= QUICK_PICK_LIMIT) break
        }
        return [...uniquePaths]
    }, [props.projectPaths, props.recentPaths])
    const browser = useRuntimeDirectoryBrowser({
        api: props.api,
        initialPath: props.selectedPath,
        workspaceRoot: props.workspaceRoot,
        enabled: props.open && props.isSupported,
    })
    const visibleEntries = useMemo(
        () => (showHidden ? browser.entries : browser.entries.filter((entry) => !isHiddenDirectoryName(entry.name))),
        [browser.entries, showHidden]
    )
    const hasHiddenOnlyEntries = !showHidden && browser.entries.length > 0 && visibleEntries.length === 0

    function applyPendingScroll(): void {
        if (!listRef.current || browser.isLoading || browser.isNavigating || pendingScrollTopRef.current === null)
            return
        listRef.current.scrollTop = pendingScrollTopRef.current
        pendingScrollTopRef.current = null
    }

    function setListNode(node: HTMLDivElement | null): void {
        listRef.current = node
        applyPendingScroll()
    }

    useEffect(applyPendingScroll, [browser.isLoading, browser.isNavigating, browser.currentPath])

    function rememberScroll(): void {
        scrollPositionsRef.current.set(browser.currentPath, listRef.current?.scrollTop ?? 0)
    }

    function browseTo(path?: string | null, restore = false): void {
        if (!path) return
        rememberScroll()
        pendingScrollTopRef.current = restore ? (scrollPositionsRef.current.get(path) ?? 0) : 0
        browser.browseTo(path)
    }

    function handleSelect(path: string): void {
        props.onSelectPath(path)
        props.onOpenChange(false)
    }

    const hasRootChips = props.isSupported && browser.roots.length > 0
    const hasShortcutStrip = quickPaths.length > 0 || hasRootChips
    const showSkeleton = props.isSupported && browser.isLoading
    const isBrowsingDisabled = props.isDisabled || browser.isNavigating

    return (
        <Dialog open={props.open} onOpenChange={props.onOpenChange}>
            <DialogContent className="ds-project-picker-dialog-content max-w-3xl overflow-hidden p-0">
                <div className="ds-project-picker-dialog-body flex h-full min-h-0 flex-col">
                    <div className="shrink-0 border-b border-[var(--ds-border-subtle)] px-4 py-3 sm:px-5">
                        <div className="flex items-start justify-between gap-3">
                            <DialogHeader className="min-w-0 gap-1 text-left">
                                <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                                    <ProjectIcon className="h-4.5 w-4.5 text-[var(--ds-accent-lime)]" />
                                    <span>{t('newSession.projectPicker.title')}</span>
                                </DialogTitle>
                            </DialogHeader>
                            <div className="flex shrink-0 items-center gap-2">
                                <ProjectPickerControlButton
                                    icon={
                                        <RefreshIcon
                                            className={cn(
                                                'h-4 w-4',
                                                browser.isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''
                                            )}
                                        />
                                    }
                                    label={t('newSession.projectPicker.refresh')}
                                    isDisabled={!props.isSupported || props.isDisabled || browser.isNavigating}
                                    onClick={() => browser.refresh()}
                                />
                                <ProjectPickerControlButton
                                    icon={<CloseIcon className="h-4 w-4" />}
                                    label={t('button.close')}
                                    onClick={() => props.onOpenChange(false)}
                                />
                            </div>
                        </div>
                    </div>

                    {hasShortcutStrip ? (
                        <div className="shrink-0 space-y-2 border-b border-[var(--ds-border-subtle)] px-4 py-3 sm:px-5">
                            <ProjectPickerChipStrip
                                label={t('newSession.projectPicker.quick')}
                                paths={quickPaths}
                                isDisabled={props.isDisabled}
                                onSelect={handleSelect}
                            />
                            {hasRootChips ? (
                                <div className="ds-project-picker-x-strip flex gap-2 overflow-x-auto">
                                    {browser.roots.map((root) => (
                                        <Button
                                            key={root.path}
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            pressStyle="chip"
                                            onClick={() => browseTo(root.path)}
                                            disabled={isBrowsingDisabled}
                                            className={PROJECT_PICKER_CHIP_CLASS_NAME}
                                        >
                                            {t(`newSession.projectPicker.root.${root.kind}`)}
                                        </Button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <ProjectPickerNavigationBar
                        currentPath={browser.currentPath}
                        parentPath={browser.parentPath}
                        isDisabled={!props.isSupported || isBrowsingDisabled}
                        showHidden={showHidden}
                        onBrowseParent={() => browseTo(browser.parentPath, true)}
                        onShowHiddenChange={setShowHidden}
                    />

                    <div ref={setListNode} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                        {browser.isNavigating ? (
                            <div className="sticky top-0 z-10 mb-2 rounded-xl border border-[var(--ds-border-subtle)] bg-[color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] px-3 py-2 text-xs font-medium text-[var(--ds-text-secondary)] shadow-[var(--ds-shadow-soft)]">
                                <Spinner size="sm" label={t('newSession.projectPicker.loading')} />
                            </div>
                        ) : null}
                        {!props.isSupported ? (
                            <InlineNotice
                                tone="warning"
                                title={t('newSession.projectPicker.unsupported')}
                                className="px-3 py-2 shadow-none"
                            />
                        ) : null}
                        {browser.error ? (
                            <InlineNotice tone="warning" title={browser.error} className="px-3 py-2 shadow-none" />
                        ) : null}
                        {showSkeleton ? <ProjectPickerDirectorySkeleton /> : null}
                        {props.isSupported && !browser.isLoading && visibleEntries.length > 0 ? (
                            <ProjectPickerDirectoryList
                                entries={visibleEntries}
                                isDisabled={isBrowsingDisabled}
                                onBrowse={(path) => browseTo(path)}
                            />
                        ) : null}
                        {props.isSupported && !browser.isLoading && visibleEntries.length === 0 && !browser.error ? (
                            <p className="px-1 py-4 text-sm text-[var(--ds-text-muted)]">
                                {t(
                                    hasHiddenOnlyEntries
                                        ? 'newSession.projectPicker.emptyHidden'
                                        : 'newSession.projectPicker.empty'
                                )}
                            </p>
                        ) : null}
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--ds-border-subtle)] px-4 py-3">
                        {browser.isRefreshing ? <Spinner size="sm" label={null} /> : null}
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSelect(browser.currentPath)}
                            disabled={!browser.hasCurrentDirectory || props.isDisabled || browser.isNavigating}
                        >
                            {t('newSession.projectPicker.useCurrent')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
})
