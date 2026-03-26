import type { RefObject } from 'react'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { AnchoredFloatingOverlay } from '@/components/ChatInput/AnchoredFloatingOverlay'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

type ComposerSuggestionsOverlayProps = {
    anchorRef: RefObject<HTMLElement | null>
    hidden?: boolean
    suggestions: readonly Suggestion[]
    selectedIndex: number
    onSelectSuggestion: (index: number) => void
}

export function ComposerSuggestionsOverlay(props: ComposerSuggestionsOverlayProps): React.JSX.Element | null {
    if (props.hidden || props.suggestions.length === 0) {
        return null
    }

    return (
        <AnchoredFloatingOverlay anchorRef={props.anchorRef}>
            <Autocomplete
                suggestions={props.suggestions}
                selectedIndex={props.selectedIndex}
                onSelect={props.onSelectSuggestion}
            />
        </AnchoredFloatingOverlay>
    )
}
