import { FeatureProjectIcon as ProjectIcon } from '@/components/featureIcons'
import { BackIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useTranslation } from '@/lib/use-translation'
import { ProjectPickerControlButton } from './ProjectPickerControlButton'

export const PROJECT_PICKER_CHIP_CLASS_NAME =
    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text-primary)] disabled:opacity-50'

const SKELETON_ROW_COUNT = 8

function getPathLabel(path: string): string {
    const parts = path.split('/').filter(Boolean)
    return parts.at(-1) ?? path
}

export function ProjectPickerChipStrip(props: {
    label: string
    paths: string[]
    isDisabled: boolean
    onSelect: (path: string) => void
}): React.JSX.Element | null {
    if (props.paths.length === 0) return null

    return (
        <div className="flex min-w-0 items-center gap-2">
            <span className="ds-metric-label shrink-0 font-semibold">{props.label}</span>
            <div className="ds-project-picker-x-strip flex min-w-0 flex-1 gap-2 overflow-x-auto">
                {props.paths.map((path) => (
                    <Button
                        key={path}
                        type="button"
                        size="sm"
                        variant="secondary"
                        pressStyle="chip"
                        onClick={() => props.onSelect(path)}
                        disabled={props.isDisabled}
                        className={PROJECT_PICKER_CHIP_CLASS_NAME}
                        title={path}
                    >
                        <ProjectIcon className="mr-1.5 h-3.5 w-3.5 text-[var(--ds-accent-lime)]" />
                        <span className="max-w-40 truncate sm:max-w-56">{getPathLabel(path)}</span>
                    </Button>
                ))}
            </div>
        </div>
    )
}

export function ProjectPickerDirectorySkeleton(): React.JSX.Element {
    return (
        <div className="space-y-1.5" aria-hidden="true">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                <div
                    key={index}
                    className="flex h-11 items-center gap-2.5 rounded-xl border border-[var(--ds-border-subtle)] px-3"
                >
                    <div className="ds-project-picker-skeleton-mark" />
                    <div
                        className={`ds-loading-shimmer ds-project-picker-skeleton-line ds-project-picker-skeleton-line-${index % 4}`}
                    />
                </div>
            ))}
        </div>
    )
}

export function ProjectPickerNavigationBar(props: {
    currentPath: string
    parentPath: string | null
    isDisabled: boolean
    showHidden: boolean
    onBrowseParent: () => void
    onShowHiddenChange: (show: boolean) => void
}): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--ds-border-subtle)] px-4 py-2.5 sm:px-5">
            <ProjectPickerControlButton
                icon={<BackIcon className="h-4 w-4" />}
                label={t('newSession.projectPicker.up')}
                isDisabled={!props.parentPath || props.isDisabled}
                onClick={props.onBrowseParent}
            />
            <div className="min-w-0 flex-1 text-xs font-medium text-[var(--ds-text-muted)]" title={props.currentPath}>
                <span className="block truncate">{props.currentPath || t('newSession.projectPicker.emptyPath')}</span>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--ds-text-secondary)]">
                <span>{t('newSession.projectPicker.showHidden')}</span>
                <Switch
                    checked={props.showHidden}
                    disabled={props.isDisabled}
                    onChange={(event) => props.onShowHiddenChange(event.currentTarget.checked)}
                    aria-label={t('newSession.projectPicker.showHidden')}
                />
            </label>
        </div>
    )
}
