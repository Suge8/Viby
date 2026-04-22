import { type KeyboardEvent as ReactKeyboardEvent, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { FeatureProjectIcon as ProjectIcon } from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { FolderOpenIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import { ProjectPickerDialog } from './ProjectPickerDialog'

type DirectoryInputProps = {
    directory: string
    suggestions: readonly Suggestion[]
    selectedIndex: number
    isDisabled: boolean
    onDirectoryChange: (value: string) => void
    onDirectoryFocus: () => void
    onDirectoryBlur: () => void
    onDirectoryKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
    onSuggestionSelect: (index: number) => void
}

type DirectoryPickerProps = {
    api: ApiClient
    supportsBrowser: boolean
    selectedPath: string
    recentPaths: string[]
    projectPaths: string[]
    isDisabled: boolean
    onOpen: () => void
    onPathSelect: (path: string) => void
}

type DirectoryStatusProps = {
    statusMessage?: string | null
    statusTone?: 'warning' | 'error' | null
}

type DirectorySectionProps = {
    input: DirectoryInputProps
    picker: DirectoryPickerProps
    status: DirectoryStatusProps
}

export function DirectorySection(props: DirectorySectionProps) {
    const { t } = useTranslation()
    const [isPickerOpen, setIsPickerOpen] = useState(false)

    return (
        <NewSessionSectionCard
            title={t('newSession.directory')}
            icon={<FolderOpenIcon className="h-5 w-5" />}
            accent="gold"
        >
            <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                    <Input
                        type="text"
                        placeholder={t('newSession.placeholder')}
                        value={props.input.directory}
                        onChange={(event) => props.input.onDirectoryChange(event.target.value)}
                        onKeyDown={props.input.onDirectoryKeyDown}
                        onFocus={props.input.onDirectoryFocus}
                        onBlur={props.input.onDirectoryBlur}
                        disabled={props.input.isDisabled}
                        className="ds-field-control-elevated ds-field-control-elevated-gold disabled:opacity-50"
                    />
                    {props.input.suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-10 mt-1">
                            <FloatingOverlay maxHeight={200}>
                                <Autocomplete
                                    suggestions={props.input.suggestions}
                                    selectedIndex={props.input.selectedIndex}
                                    onSelect={props.input.onSuggestionSelect}
                                />
                            </FloatingOverlay>
                        </div>
                    )}
                </div>

                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={props.picker.isDisabled}
                    onClick={() => {
                        props.picker.onOpen()
                        setIsPickerOpen(true)
                    }}
                    className="ds-directory-picker-button"
                >
                    <ProjectIcon className="mr-2 h-4 w-4" />
                    {t('newSession.projectPicker.open')}
                </Button>
            </div>

            {props.picker.recentPaths.length > 0 && (
                <div className="mt-3.5 flex flex-col gap-2">
                    <span className="ds-directory-recent-label text-xs font-semibold uppercase text-[var(--ds-text-muted)]">
                        {t('newSession.recent')}
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {props.picker.recentPaths.map((path) => (
                            <Button
                                key={path}
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => props.picker.onPathSelect(path)}
                                disabled={props.picker.isDisabled}
                                className="ds-recent-path-chip truncate disabled:opacity-50"
                                title={path}
                            >
                                {path}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {props.status.statusMessage ? (
                <div className="mt-0.5">
                    <InlineNotice
                        tone={props.status.statusTone === 'error' ? 'danger' : 'warning'}
                        title={props.status.statusMessage}
                        className="px-2.5 py-2 shadow-none"
                    />
                </div>
            ) : null}

            <ProjectPickerDialog
                api={props.picker.api}
                isSupported={props.picker.supportsBrowser}
                open={isPickerOpen}
                selectedPath={props.picker.selectedPath}
                recentPaths={props.picker.recentPaths}
                projectPaths={props.picker.projectPaths}
                isDisabled={props.picker.isDisabled}
                onOpenChange={setIsPickerOpen}
                onSelectPath={props.picker.onPathSelect}
            />
        </NewSessionSectionCard>
    )
}
