import type { RefObject } from 'react'
import { AnchoredFloatingOverlay } from '@/components/ChatInput/AnchoredFloatingOverlay'
import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

type ComposerSuggestionsOverlayProps = {
    anchorRef: RefObject<HTMLElement | null>
    autocompleteLayout?: {
        visibleViewportBottomPx: number
    }
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
        <AnchoredFloatingOverlay
            anchorRef={props.anchorRef}
            maxHeight={360}
            visibleViewportBottomPx={props.autocompleteLayout?.visibleViewportBottomPx}
        >
            <Autocomplete
                suggestions={props.suggestions}
                selectedIndex={props.selectedIndex}
                onSelect={props.onSelectSuggestion}
            />
        </AnchoredFloatingOverlay>
    )
}
