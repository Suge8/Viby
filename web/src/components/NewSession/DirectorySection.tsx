import { type KeyboardEvent as ReactKeyboardEvent, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { FeatureProjectIcon as ProjectIcon } from '@/components/featureIcons'
import { InlineNotice } from '@/components/InlineNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'
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

export type DirectorySectionProps = {
    input: DirectoryInputProps
    picker: DirectoryPickerProps
    status: DirectoryStatusProps
}

export function DirectorySection(props: DirectorySectionProps): React.JSX.Element {
    const { t } = useTranslation()
    const [isPickerOpen, setIsPickerOpen] = useState(false)
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
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
                    size="iconSm"
                    variant="secondary"
                    pressStyle="button"
                    disabled={props.picker.isDisabled}
                    onClick={() => {
                        props.picker.onOpen()
                        setIsPickerOpen(true)
                    }}
                    className="ds-directory-picker-icon-button"
                    aria-label={t('newSession.projectPicker.open')}
                    title={t('newSession.projectPicker.open')}
                >
                    <ProjectIcon className="h-4.5 w-4.5" />
                </Button>
            </div>

            {props.status.statusMessage ? (
                <InlineNotice
                    tone={props.status.statusTone === 'error' ? 'danger' : 'warning'}
                    title={props.status.statusMessage}
                    className="px-2.5 py-2 shadow-none"
                />
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
        </div>
    )
}
