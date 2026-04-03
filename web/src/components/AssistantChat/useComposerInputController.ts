import { type useAssistantApi } from '@assistant-ui/react'
import type { SessionDriver } from '@viby/protocol'
import {
    type ChangeEvent as ReactChangeEvent,
    type ClipboardEvent as ReactClipboardEvent,
    type CompositionEvent as ReactCompositionEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type SyntheticEvent as ReactSyntheticEvent,
    useCallback,
    useRef,
    useState,
} from 'react'
import { isComposerCompositionActive, isComposerSendShortcut } from '@/components/AssistantChat/composerKeyboard'
import { useClaudeComposerModelShortcut } from '@/components/AssistantChat/useClaudeComposerModelShortcut'
import { useComposerMirroredInputState } from '@/components/AssistantChat/useComposerMirroredInputState'
import type { PermissionMode } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import { useActiveWord } from '@/hooks/useActiveWord'
import { useActiveSuggestions } from '@/hooks/useActiveSuggestions'
import { applySuggestion } from '@/utils/applySuggestion'
import { markSkillUsed } from '@/lib/recent-skill-usage'

type ComposerApi = ReturnType<typeof useAssistantApi>
type HapticFeedback = (type?: 'light' | 'success' | 'error') => void

type UseComposerInputControllerOptions = {
    api: ComposerApi
    composerText: string
    canSend: boolean
    threadIsRunning: boolean
    permissionMode: PermissionMode
    permissionModes: readonly PermissionMode[]
    autocompletePrefixes: readonly string[]
    autocompleteSuggestions: (query: string) => Promise<Suggestion[]>
    sessionDriver: SessionDriver | null
    model: string | null
    onAbort: () => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onSend: () => void
    haptic: HapticFeedback
}

type UseComposerInputControllerResult = {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>
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

const RESTORE_SELECTION_DELAY_MS = 0

function getNextPermissionMode(options: {
    permissionMode: PermissionMode
    permissionModes: readonly PermissionMode[]
}): PermissionMode {
    const { permissionMode, permissionModes } = options
    const currentIndex = permissionModes.indexOf(permissionMode)
    const nextIndex = (currentIndex + 1) % permissionModes.length
    return permissionModes[nextIndex] ?? 'default'
}

export function useComposerInputController(
    options: UseComposerInputControllerOptions
): UseComposerInputControllerResult {
    const {
        api,
        composerText,
        canSend,
        threadIsRunning,
        permissionMode,
        permissionModes,
        autocompletePrefixes,
        autocompleteSuggestions,
        sessionDriver,
        model,
        onAbort,
        onPermissionModeChange,
        onModelChange,
        onSend,
        haptic,
    } = options
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [inputState, setInputState] = useComposerMirroredInputState(composerText)
    const [isComposing, setIsComposing] = useState(false)
    const activeWord = useActiveWord(inputState.text, inputState.selection, autocompletePrefixes as string[])
    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeWord,
        autocompleteSuggestions,
        { clampSelection: true, wrapAround: true }
    )

    useClaudeComposerModelShortcut({
        sessionDriver,
        model,
        onModelChange,
        haptic
    })

    const handleSuggestionSelect = useCallback((index: number) => {
        const suggestion = suggestions[index]
        if (!suggestion || !textareaRef.current) {
            return
        }

        if (suggestion.text.startsWith('$')) {
            markSkillUsed(suggestion.text.slice(1))
        }

        let textToInsert = suggestion.text
        let addSpace = true
        if (sessionDriver === 'codex' && suggestion.source === 'user' && suggestion.content) {
            textToInsert = suggestion.content
            addSpace = false
        }

        const result = applySuggestion(
            inputState.text,
            inputState.selection,
            textToInsert,
            autocompletePrefixes as string[],
            addSpace
        )

        api.composer().setText(result.text)
        setInputState({
            text: result.text,
            selection: { start: result.cursorPosition, end: result.cursorPosition }
        })

        setTimeout(() => {
            const input = textareaRef.current
            if (!input) {
                return
            }

            input.setSelectionRange(result.cursorPosition, result.cursorPosition)
            try {
                input.focus({ preventScroll: true })
            } catch {
                input.focus()
            }
        }, RESTORE_SELECTION_DELAY_MS)

        haptic('light')
    }, [api, autocompletePrefixes, haptic, inputState, sessionDriver, suggestions])

    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        const key = event.key

        if (isComposerCompositionActive({
            isComposing,
            nativeIsComposing: event.nativeEvent.isComposing
        })) {
            return
        }

        if (isComposerSendShortcut({
            key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            altKey: event.altKey
        })) {
            event.preventDefault()
            if (!canSend) {
                return
            }
            api.composer().send()
            onSend()
            return
        }

        if (suggestions.length > 0) {
            if (key === 'ArrowUp') {
                event.preventDefault()
                moveUp()
                return
            }
            if (key === 'ArrowDown') {
                event.preventDefault()
                moveDown()
                return
            }
            if ((key === 'Enter' || key === 'Tab') && !event.shiftKey) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex >= 0 ? selectedIndex : 0)
                return
            }
            if (key === 'Escape') {
                event.preventDefault()
                clearSuggestions()
                return
            }
        }

        if (key === 'Escape' && threadIsRunning) {
            event.preventDefault()
            onAbort()
            return
        }

        if (key === 'Tab' && event.shiftKey && onPermissionModeChange && permissionModes.length > 0) {
            event.preventDefault()
            onPermissionModeChange(getNextPermissionMode({ permissionMode, permissionModes }))
            haptic('light')
        }
    }, [
        api,
        canSend,
        clearSuggestions,
        handleSuggestionSelect,
        haptic,
        moveDown,
        moveUp,
        onAbort,
        onPermissionModeChange,
        onSend,
        permissionMode,
        permissionModes,
        selectedIndex,
        suggestions.length,
        threadIsRunning,
        isComposing,
    ])

    const handleCompositionStart = useCallback((_event: ReactCompositionEvent<HTMLTextAreaElement>) => {
        setIsComposing(true)
    }, [])

    const handleCompositionEnd = useCallback((_event: ReactCompositionEvent<HTMLTextAreaElement>) => {
        setIsComposing(false)
    }, [])

    const handleChange = useCallback((event: ReactChangeEvent<HTMLTextAreaElement>) => {
        setInputState({
            text: event.target.value,
            selection: {
                start: event.target.selectionStart,
                end: event.target.selectionEnd
            }
        })
    }, [])

    const handleSelect = useCallback((event: ReactSyntheticEvent<HTMLTextAreaElement>) => {
        const target = event.target as HTMLTextAreaElement
        setInputState((previousState) => ({
            ...previousState,
            selection: { start: target.selectionStart, end: target.selectionEnd }
        }))
    }, [])

    const handlePaste = useCallback(async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
        const files = Array.from(event.clipboardData?.files || [])
        const imageFiles = files.filter((file) => file.type.startsWith('image/'))

        if (imageFiles.length === 0) {
            return
        }

        event.preventDefault()

        try {
            for (const file of imageFiles) {
                await api.composer().addAttachment(file)
            }
        } catch (error) {
            console.error('Error adding pasted image:', error)
        }
    }, [api])

    return {
        textareaRef,
        suggestions,
        selectedIndex,
        handleSuggestionSelect,
        handleKeyDown,
        handleCompositionStart,
        handleCompositionEnd,
        handleChange,
        handleSelect,
        handlePaste,
    }
}
