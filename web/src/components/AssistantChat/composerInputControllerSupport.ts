import { type useAssistantApi } from '@assistant-ui/react'
import type { SessionDriver } from '@viby/protocol'
import type {
    ChangeEvent as ReactChangeEvent,
    ClipboardEvent as ReactClipboardEvent,
    CompositionEvent as ReactCompositionEvent,
    KeyboardEvent as ReactKeyboardEvent,
    SyntheticEvent as ReactSyntheticEvent,
    RefObject,
} from 'react'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { PermissionMode } from '@/types/api'

type NextPermissionModeOptions = {
    permissionMode: PermissionMode
    permissionModes: readonly PermissionMode[]
}

type SuggestionInsertOptions = {
    content?: string
    sessionDriver: string | null
    source?: string
    text: string
}

type SuggestionSelectKeyOptions = {
    key: string
    selectedIndex: number
    shiftKey: boolean
}

type ComposerApi = ReturnType<typeof useAssistantApi>

export type ComposerHapticFeedback = (type?: 'light' | 'success' | 'error') => void

export type UseComposerInputControllerOptions = {
    api: ComposerApi
    composerText: string
    canSend: boolean
    isTouch: boolean
    threadIsRunning: boolean
    permissionMode: PermissionMode
    permissionModes: readonly PermissionMode[]
    autocompletePrefixes: readonly string[]
    autocompleteSuggestions: (query: string) => Promise<Suggestion[]>
    autocompleteRefreshKey?: number
    onSuggestionAction?: (suggestion: Suggestion) => void
    sessionDriver: SessionDriver | null
    model: string | null
    onAbort: () => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onSendRequest: () => void
    haptic: ComposerHapticFeedback
}

export type UseComposerInputControllerResult = {
    textareaRef: RefObject<HTMLTextAreaElement | null>
    suggestions: readonly Suggestion[]
    selectedIndex: number
    handleSuggestionSelect: (index: number) => void
    handleKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
    handleCompositionStart: (event: ReactCompositionEvent<HTMLTextAreaElement>) => void
    handleCompositionEnd: (event: ReactCompositionEvent<HTMLTextAreaElement>) => void
    handleChange: (event: ReactChangeEvent<HTMLTextAreaElement>) => void
    handleSelect: (event: ReactSyntheticEvent<HTMLTextAreaElement>) => void
    handlePaste: (event: ReactClipboardEvent<HTMLTextAreaElement>) => Promise<void>
}

export function getNextPermissionMode(options: NextPermissionModeOptions): PermissionMode {
    const { permissionMode, permissionModes } = options
    const currentIndex = permissionModes.indexOf(permissionMode)
    const nextIndex = (currentIndex + 1) % permissionModes.length
    return permissionModes[nextIndex] ?? 'default'
}

export function getSuggestionInsert(options: SuggestionInsertOptions): { addSpace: boolean; text: string } {
    const { content, sessionDriver, source, text } = options
    if (sessionDriver === 'codex' && source === 'user' && content) {
        return {
            text: content,
            addSpace: false,
        }
    }

    return {
        text,
        addSpace: true,
    }
}

export function shouldSelectSuggestionFromKey(options: SuggestionSelectKeyOptions): boolean {
    const { key, selectedIndex, shiftKey } = options
    const isCommitKey = key === 'Enter' || key === 'Tab'
    return isCommitKey && !shiftKey && selectedIndex >= 0
}
