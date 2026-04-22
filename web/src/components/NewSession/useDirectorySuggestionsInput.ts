import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useState } from 'react'

import { type Suggestion, useActiveSuggestions } from '@/hooks/useActiveSuggestions'
import { isImeKeyboardCompositionActive } from '@/lib/imeInputGuards'

interface UseDirectorySuggestionsInputOptions {
    directory: string
    verifiedPaths: string[]
    onDirectoryChange: (value: string) => void
}

interface DirectorySuggestionsInputState {
    suggestions: readonly Suggestion[]
    selectedIndex: number
    handleDirectoryBlur: () => void
    handleDirectoryChange: (value: string) => void
    handleDirectoryFocus: () => void
    handleDirectoryKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
    handleSuggestionSelect: (index: number) => void
}

export function useDirectorySuggestionsInput(
    options: UseDirectorySuggestionsInputOptions
): DirectorySuggestionsInputState {
    const { directory, verifiedPaths, onDirectoryChange } = options
    const [suppressSuggestions, setSuppressSuggestions] = useState(false)
    const [isDirectoryFocused, setIsDirectoryFocused] = useState(false)

    const getSuggestions = useCallback(
        async (query: string): Promise<Suggestion[]> => {
            const lowered = query.toLowerCase()
            return verifiedPaths
                .filter((path) => path.toLowerCase().includes(lowered))
                .slice(0, 8)
                .map((path) => ({
                    key: path,
                    text: path,
                    label: path,
                }))
        },
        [verifiedPaths]
    )

    const activeQuery = !isDirectoryFocused || suppressSuggestions ? null : directory
    const [suggestions, selectedIndex, moveUp, moveDown, clearSuggestions] = useActiveSuggestions(
        activeQuery,
        getSuggestions,
        { allowEmptyQuery: true, autoSelectFirst: false }
    )

    const handleSuggestionSelect = useCallback(
        (index: number) => {
            const suggestion = suggestions[index]
            if (!suggestion) {
                return
            }
            onDirectoryChange(suggestion.text)
            clearSuggestions()
            setSuppressSuggestions(true)
        },
        [clearSuggestions, onDirectoryChange, suggestions]
    )

    const handleDirectoryChange = useCallback(
        (value: string) => {
            setSuppressSuggestions(false)
            onDirectoryChange(value)
        },
        [onDirectoryChange]
    )
    const handleDirectoryFocus = useCallback(() => {
        setSuppressSuggestions(false)
        setIsDirectoryFocused(true)
    }, [])
    const handleDirectoryBlur = useCallback(() => {
        setIsDirectoryFocused(false)
    }, [])

    const handleDirectoryKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (
                isImeKeyboardCompositionActive({
                    isComposing: false,
                    nativeEvent: event.nativeEvent,
                })
            ) {
                return
            }

            if (suggestions.length === 0) {
                return
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveUp()
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveDown()
            }
            if ((event.key === 'Enter' || event.key === 'Tab') && selectedIndex >= 0) {
                event.preventDefault()
                handleSuggestionSelect(selectedIndex)
            }
            if (event.key === 'Escape') {
                clearSuggestions()
            }
        },
        [clearSuggestions, handleSuggestionSelect, moveDown, moveUp, selectedIndex, suggestions.length]
    )

    return {
        suggestions,
        selectedIndex,
        handleDirectoryBlur,
        handleDirectoryChange,
        handleDirectoryFocus,
        handleDirectoryKeyDown,
        handleSuggestionSelect,
    }
}
