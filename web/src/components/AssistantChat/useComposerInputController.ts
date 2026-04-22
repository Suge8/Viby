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
import {
    getNextPermissionMode,
    getSuggestionInsert,
    shouldSelectSuggestionFromKey,
    type UseComposerInputControllerOptions,
    type UseComposerInputControllerResult,
} from '@/components/AssistantChat/composerInputControllerSupport'
import {
    isComposerCompositionActive,
    shouldComposerSendFromKeyboard,
} from '@/components/AssistantChat/composerKeyboard'
import { useClaudeComposerModelShortcut } from '@/components/AssistantChat/useClaudeComposerModelShortcut'
import { useComposerMirroredInputState } from '@/components/AssistantChat/useComposerMirroredInputState'
import { useActiveSuggestions } from '@/hooks/useActiveSuggestions'
import { useActiveWord } from '@/hooks/useActiveWord'
import { markSkillUsed } from '@/lib/recent-skill-usage'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { applySuggestion } from '@/utils/applySuggestion'

const RESTORE_SELECTION_DELAY_MS = 0

function restoreComposerSelection(cursorPosition: number, textarea: HTMLTextAreaElement | null): void {
    setTimeout(() => {
        if (!textarea) {
            return
        }

        textarea.setSelectionRange(cursorPosition, cursorPosition)
        try {
            textarea.focus({ preventScroll: true })
        } catch {
            textarea.focus()
        }
    }, RESTORE_SELECTION_DELAY_MS)
}

export function useComposerInputController(
    options: UseComposerInputControllerOptions
): UseComposerInputControllerResult {
    const {
        api,
        composerText,
        canSend,
        isTouch,
        threadIsRunning,
        permissionMode,
        permissionModes,
        autocompletePrefixes,
        autocompleteSuggestions,
        autocompleteRefreshKey,
        onSuggestionAction,
        sessionDriver,
        model,
        onAbort,
        onPermissionModeChange,
        onModelChange,
        onSendRequest,
        haptic,
    } = options
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [inputState, setInputState] = useComposerMirroredInputState(composerText)
    const [isComposing, setIsComposing] = useState(false)
    const activeWord = useActiveWord(inputState.text, inputState.selection, autocompletePrefixes as string[])
    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeWord,
        autocompleteSuggestions,
        { clampSelection: true, autoSelectFirst: false, wrapAround: true, refreshKey: autocompleteRefreshKey ?? 0 }
    )

    useClaudeComposerModelShortcut({
        sessionDriver,
        model,
        onModelChange,
        haptic,
    })

    const handleSuggestionSelect = useCallback(
        (index: number) => {
            const suggestion = suggestions[index]
            if (!suggestion) {
                return
            }

            if (suggestion.disabled) {
                haptic('error')
                return
            }

            if (suggestion.actionType) {
                onSuggestionAction?.(suggestion)
                haptic('light')
                return
            }

            if (suggestion.text.startsWith('$')) {
                markSkillUsed(suggestion.text.slice(1))
            }

            if (!textareaRef.current) {
                return
            }

            const suggestionInsert = getSuggestionInsert({
                text: suggestion.text,
                content: suggestion.content,
                sessionDriver,
                source: suggestion.source,
            })

            const result = applySuggestion(
                inputState.text,
                inputState.selection,
                suggestionInsert.text,
                autocompletePrefixes as string[],
                suggestionInsert.addSpace
            )

            api.composer().setText(result.text)
            setInputState({
                text: result.text,
                selection: { start: result.cursorPosition, end: result.cursorPosition },
            })

            restoreComposerSelection(result.cursorPosition, textareaRef.current)

            haptic('light')
        },
        [api, autocompletePrefixes, haptic, inputState, onSuggestionAction, sessionDriver, suggestions]
    )

    const handleKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
            const key = event.key

            if (
                isComposerCompositionActive({
                    isComposing,
                    nativeEvent: event.nativeEvent,
                })
            ) {
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
                if (
                    shouldSelectSuggestionFromKey({
                        key,
                        shiftKey: event.shiftKey,
                        selectedIndex,
                    })
                ) {
                    event.preventDefault()
                    handleSuggestionSelect(selectedIndex)
                    return
                }
                if (key === 'Escape') {
                    event.preventDefault()
                    clearSuggestions()
                    return
                }
            }

            if (
                shouldComposerSendFromKeyboard({
                    key,
                    shiftKey: event.shiftKey,
                    altKey: event.altKey,
                    isTouch,
                })
            ) {
                event.preventDefault()
                if (!canSend) {
                    return
                }
                onSendRequest()
                return
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
        },
        [
            canSend,
            clearSuggestions,
            handleSuggestionSelect,
            haptic,
            moveDown,
            moveUp,
            onAbort,
            onPermissionModeChange,
            onSendRequest,
            permissionMode,
            permissionModes,
            selectedIndex,
            suggestions.length,
            threadIsRunning,
            isComposing,
            isTouch,
        ]
    )

    const handleCompositionStart = useCallback((_event: ReactCompositionEvent<HTMLTextAreaElement>) => {
        setIsComposing(true)
    }, [])

    const handleCompositionEnd = useCallback((_event: ReactCompositionEvent<HTMLTextAreaElement>) => {
        setIsComposing(false)
    }, [])

    const handleChange = useCallback((event: ReactChangeEvent<HTMLTextAreaElement>) => {
        const nextText = event.target.value
        setInputState({
            text: nextText,
            selection: {
                start: event.target.selectionStart,
                end: event.target.selectionEnd,
            },
        })
    }, [])

    const handleSelect = useCallback((event: ReactSyntheticEvent<HTMLTextAreaElement>) => {
        const target = event.target as HTMLTextAreaElement
        setInputState((previousState) => ({
            ...previousState,
            selection: { start: target.selectionStart, end: target.selectionEnd },
        }))
    }, [])

    const handlePaste = useCallback(
        async (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
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
                reportWebRuntimeError('Error adding pasted image.', error)
            }
        },
        [api]
    )

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
