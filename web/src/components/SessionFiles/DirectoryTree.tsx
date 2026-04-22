import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { FileIcon } from '@/components/FileIcon'
import { InlineNotice } from '@/components/InlineNotice'
import { ChevronIcon, FolderOpenIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useSessionDirectory } from '@/hooks/queries/useSessionDirectory'
import { useTranslation } from '@/lib/use-translation'

function DirectorySkeleton(props: { depth: number; rows?: number }) {
    const rows = props.rows ?? 4
    const indent = 12 + props.depth * 14

    return (
        <div className="animate-pulse">
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={`dir-skel-${props.depth}-${index}`}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ paddingLeft: indent }}
                >
                    <div className="h-5 w-5 rounded bg-[var(--app-subtle-bg)]" />
                    <div className="h-3 w-40 rounded bg-[var(--app-subtle-bg)]" />
                </div>
            ))}
        </div>
    )
}

function DirectoryErrorRow(props: { depth: number; message: string }) {
    const indent = 12 + props.depth * 14
    return (
        <div className="px-3 py-2" style={{ paddingLeft: indent }}>
            <InlineNotice tone="warning" title={props.message} className="px-2.5 py-2 text-xs shadow-none" />
        </div>
    )
}

function DirectoryNode(props: {
    api: ApiClient | null
    sessionId: string
    path: string
    label: string
    depth: number
    emptyLabel: string
    onOpenFile: (path: string) => void
    expanded: Set<string>
    onToggle: (path: string) => void
}) {
    const isExpanded = props.expanded.has(props.path)
    const { entries, error, isLoading } = useSessionDirectory(props.api, props.sessionId, props.path, {
        enabled: isExpanded,
    })

    const directories = useMemo(() => entries.filter((entry) => entry.type === 'directory'), [entries])
    const files = useMemo(() => entries.filter((entry) => entry.type === 'file'), [entries])
    const childDepth = props.depth + 1

    const indent = 12 + props.depth * 14
    const childIndent = 12 + childDepth * 14

    return (
        <div>
            <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() => props.onToggle(props.path)}
                className="w-full gap-3 px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)] [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start"
                style={{ paddingLeft: indent }}
            >
                <ChevronIcon collapsed={!isExpanded} className="h-4 w-4 text-[var(--app-hint)]" />
                <FolderOpenIcon
                    className="ds-directory-tree-folder-icon text-[var(--ds-accent-gold)]"
                    strokeWidth={1.8}
                />
                <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{props.label}</div>
                </div>
            </Button>

            {isExpanded ? (
                isLoading ? (
                    <DirectorySkeleton depth={childDepth} />
                ) : error ? (
                    <DirectoryErrorRow depth={childDepth} message={error} />
                ) : (
                    <div>
                        {directories.map((entry) => {
                            const childPath = props.path ? `${props.path}/${entry.name}` : entry.name
                            return (
                                <DirectoryNode
                                    key={childPath}
                                    api={props.api}
                                    sessionId={props.sessionId}
                                    path={childPath}
                                    label={entry.name}
                                    depth={childDepth}
                                    emptyLabel={props.emptyLabel}
                                    onOpenFile={props.onOpenFile}
                                    expanded={props.expanded}
                                    onToggle={props.onToggle}
                                />
                            )
                        })}

                        {files.map((entry) => {
                            const filePath = props.path ? `${props.path}/${entry.name}` : entry.name
                            return (
                                <Button
                                    key={filePath}
                                    type="button"
                                    variant="plain"
                                    size="sm"
                                    onClick={() => props.onOpenFile(filePath)}
                                    className="w-full gap-3 px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)] [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-start"
                                    style={{ paddingLeft: childIndent }}
                                >
                                    <span className="h-4 w-4" />
                                    <FileIcon fileName={entry.name} size={22} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">{entry.name}</div>
                                    </div>
                                </Button>
                            )
                        })}

                        {directories.length === 0 && files.length === 0 ? (
                            <div
                                className="px-3 py-2 text-sm text-[var(--app-hint)]"
                                style={{ paddingLeft: childIndent }}
                            >
                                {props.emptyLabel}
                            </div>
                        ) : null}
                    </div>
                )
            ) : null}
        </div>
    )
}

export function DirectoryTree(props: {
    api: ApiClient | null
    sessionId: string
    rootLabel: string
    onOpenFile: (path: string) => void
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))

    const handleToggle = useCallback((path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(path)) {
                next.delete(path)
            } else {
                next.add(path)
            }
            return next
        })
    }, [])

    return (
        <div className="border-t border-[var(--app-divider)]">
            <DirectoryNode
                api={props.api}
                sessionId={props.sessionId}
                path=""
                label={props.rootLabel}
                depth={0}
                emptyLabel={t('files.empty.directory')}
                onOpenFile={props.onOpenFile}
                expanded={expanded}
                onToggle={handleToggle}
            />
        </div>
    )
}
