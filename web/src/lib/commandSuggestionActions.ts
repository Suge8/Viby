import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { CommandCapabilityActionType } from '@/types/api'

type NewSessionNavigation = {
    to: '/sessions/new'
    search?: {
        mode?: 'recover-local'
    }
}

type SuggestionNavigation = NewSessionNavigation

const COMMAND_SUGGESTION_NAVIGATION_REGISTRY: Partial<Record<CommandCapabilityActionType, SuggestionNavigation>> = {
    open_new_session: { to: '/sessions/new' },
}

export function resolveCommandSuggestionNavigation(suggestion: Suggestion): SuggestionNavigation | null {
    return suggestion.actionType ? (COMMAND_SUGGESTION_NAVIGATION_REGISTRY[suggestion.actionType] ?? null) : null
}
