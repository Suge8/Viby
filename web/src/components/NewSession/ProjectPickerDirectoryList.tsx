import { FeatureFolderIcon as FolderIcon } from '@/components/featureIcons'
import { FolderOpenIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import type { RuntimeDirectoryEntry } from '@/types/api'

type ProjectPickerDirectoryListProps = {
    entries: RuntimeDirectoryEntry[]
    isDisabled: boolean
    onBrowse: (path: string) => void
}

const DIRECTORY_ROW_CLASS_NAME =
    'group min-h-11 w-full rounded-xl px-3 py-2 text-left shadow-none transition-colors disabled:opacity-50 [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between'

function getDirectoryParent(path: string): string {
    const index = path.lastIndexOf('/')
    if (index <= 0) return path
    return path.slice(0, index)
}

export function ProjectPickerDirectoryList(props: ProjectPickerDirectoryListProps): React.JSX.Element {
    return (
        <div className="space-y-1.5">
            {props.entries.map((entry) => (
                <Button
                    key={entry.path}
                    type="button"
                    variant="secondary"
                    size="sm"
                    pressStyle="list-row"
                    onClick={() => props.onBrowse(entry.path)}
                    disabled={props.isDisabled}
                    className={DIRECTORY_ROW_CLASS_NAME}
                >
                    <span className="flex min-w-0 items-center gap-2.5">
                        <FolderIcon className="h-4 w-4 shrink-0 text-[var(--ds-accent-gold)]" />
                        <span className="min-w-0 leading-tight">
                            <span className="block truncate text-sm font-medium text-[var(--ds-text-primary)]">
                                {entry.name}
                            </span>
                            <span className="block truncate text-xs text-[var(--ds-text-muted)]">
                                {getDirectoryParent(entry.path)}
                            </span>
                        </span>
                    </span>
                    <FolderOpenIcon className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)] transition-colors group-hover:text-[var(--ds-text-secondary)]" />
                </Button>
            ))}
        </div>
    )
}
