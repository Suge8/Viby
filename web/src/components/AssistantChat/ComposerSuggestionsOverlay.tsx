import { Autocomplete } from '@/components/ChatInput/Autocomplete'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

type ComposerSuggestionsOverlayProps = {
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
        <div className="absolute bottom-[100%] mb-2 w-full">
            <FloatingOverlay>
                <Autocomplete
                    suggestions={props.suggestions}
                    selectedIndex={props.selectedIndex}
                    onSelect={props.onSelectSuggestion}
                />
            </FloatingOverlay>
        </div>
    )
}
