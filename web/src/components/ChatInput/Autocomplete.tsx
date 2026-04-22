import { memo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { Suggestion, SuggestionBadge } from '@/hooks/useActiveSuggestions'
import { useTranslation } from '@/lib/use-translation'

interface AutocompleteProps {
    suggestions: readonly Suggestion[]
    selectedIndex: number
    onSelect: (index: number) => void
}

const MAX_FALLBACK_HINT_LENGTH = 48

function toCompactHint(description: string): string {
    const normalized = description.trim().replace(/\.+$/u, '')
    if (normalized.length === 0) {
        return ''
    }

    const truncated =
        normalized.length > MAX_FALLBACK_HINT_LENGTH
            ? `${normalized.slice(0, MAX_FALLBACK_HINT_LENGTH - 1).trimEnd()}…`
            : normalized
    return truncated
}

function getCommandHintKey(trigger: string): string | null {
    switch (trigger) {
        case '/new':
            return 'autocomplete.commandHint.new'
        case '/clear':
            return 'autocomplete.commandHint.clear'
        case '/compact':
            return 'autocomplete.commandHint.compact'
        case '/help':
            return 'autocomplete.commandHint.help'
        case '/status':
            return 'autocomplete.commandHint.status'
        case '/fork':
            return 'autocomplete.commandHint.fork'
        case '/rewind':
            return 'autocomplete.commandHint.rewind'
        case '/diff':
            return 'autocomplete.commandHint.diff'
        case '/review':
            return 'autocomplete.commandHint.review'
        default:
            return null
    }
}

function getInlineDescription(options: {
    suggestion: Suggestion
    t: (key: string, params?: Record<string, string | number>) => string
}): string | null {
    const { suggestion, t } = options
    if (suggestion.disabled) {
        if (suggestion.text === '/fork') {
            return t('autocomplete.sessionAction.fork')
        }
        if (suggestion.text === '/rewind') {
            return t('autocomplete.sessionAction.rewind')
        }
        return t('autocomplete.sessionAction.guarded')
    }

    if (suggestion.actionType === 'open_new_session') {
        return t('autocomplete.sessionAction.new')
    }

    const registryHintKey = getCommandHintKey(suggestion.text)
    if (registryHintKey) {
        return t(registryHintKey)
    }

    if (suggestion.description) {
        return toCompactHint(suggestion.description)
    }

    return null
}

function getGroupHeading(label: string | undefined, t: (key: string) => string): string | null {
    switch (label) {
        case 'Native Commands':
            return t('autocomplete.group.native')
        case 'Custom Commands':
            return t('autocomplete.group.custom')
        case 'Session Actions':
            return t('autocomplete.group.actions')
        case 'Viby Skills':
            return t('autocomplete.group.skills')
        default:
            return label ?? null
    }
}

function getBadgeClassName(tone: SuggestionBadge['tone']): string {
    switch (tone) {
        case 'warning':
            return 'bg-amber-500/12 text-amber-700'
        case 'accent':
            return 'bg-sky-500/12 text-sky-700'
        default:
            return 'bg-[var(--app-secondary-bg)] text-[var(--app-hint)]'
    }
}

function getBadgeLabel(badge: SuggestionBadge, t: (key: string) => string): string {
    if (badge.kind === 'provider') {
        switch (badge.provider) {
            case 'claude':
                return 'Claude'
            case 'codex':
                return 'Codex'
            case 'gemini':
                return 'Gemini'
            case 'opencode':
                return 'OpenCode'
            case 'cursor':
                return 'Cursor'
            case 'pi':
                return 'Pi'
            default:
                return 'Viby'
        }
    }

    if (badge.kind === 'source') {
        switch (badge.source) {
            case 'project':
                return t('autocomplete.badge.project')
            case 'local':
                return t('autocomplete.badge.local')
            case 'plugin':
                return t('autocomplete.badge.plugin')
            case 'viby':
                return 'Viby'
        }
    }

    switch (badge.effect) {
        case 'context':
            return t('autocomplete.badge.context')
        default:
            return ''
    }
}

/**
 * Autocomplete suggestions list component
 */
export const Autocomplete = memo(function Autocomplete(props: AutocompleteProps) {
    const { t } = useTranslation()
    const { suggestions, selectedIndex, onSelect } = props
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (selectedIndex < 0 || selectedIndex >= suggestions.length) return
        const listEl = listRef.current
        if (!listEl) return
        const selectedEl = listEl.querySelector<HTMLButtonElement>(`[data-suggestion-index="${selectedIndex}"]`)
        if (typeof selectedEl?.scrollIntoView === 'function') {
            selectedEl.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex, suggestions])

    if (suggestions.length === 0) {
        return null
    }

    let previousGroupLabel: string | null = null

    return (
        <div className="space-y-1 px-2 py-2" ref={listRef}>
            {suggestions.map((suggestion, index) => {
                const showGroupLabel = suggestion.groupLabel && suggestion.groupLabel !== previousGroupLabel
                previousGroupLabel = suggestion.groupLabel ?? previousGroupLabel
                const isSelected = index === selectedIndex
                const isDisabled = suggestion.disabled === true
                const inlineDescription = getInlineDescription({ suggestion, t })

                return (
                    <div key={suggestion.key}>
                        {showGroupLabel ? (
                            <div className="px-2 pb-1 pt-2 text-xs font-semibold tracking-widest text-[var(--app-hint)] first:pt-0">
                                {getGroupHeading(suggestion.groupLabel, t)}
                            </div>
                        ) : null}
                        <Button
                            type="button"
                            variant={isSelected ? 'secondary' : 'plain'}
                            size="sm"
                            data-suggestion-index={index}
                            className={`w-full rounded-2xl border px-3 py-2 text-left text-sm shadow-none [&>[data-button-content]]:w-full [&>[data-button-content]]:flex-col [&>[data-button-content]]:items-start ${
                                isSelected
                                    ? 'border-[var(--app-link)] bg-[var(--app-button)] text-[var(--app-button-text)]'
                                    : 'border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] hover:bg-[var(--app-secondary-bg)]'
                            } ${isDisabled ? 'opacity-70' : ''}`}
                            onClick={() => onSelect(index)}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <div className="flex w-full items-start justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm tracking-tight">
                                    <span className="font-mono font-semibold text-[var(--app-fg)]">
                                        {suggestion.label}
                                    </span>
                                    {inlineDescription ? (
                                        <span
                                            className={`ml-2 truncate text-xs ${
                                                isSelected ? 'opacity-85' : 'text-[var(--app-hint)]'
                                            }`}
                                        >
                                            {inlineDescription}
                                        </span>
                                    ) : null}
                                </span>
                                {suggestion.badges && suggestion.badges.length > 0 ? (
                                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                                        {suggestion.badges.map((badge) => (
                                            <span
                                                key={`${suggestion.key}:${index}:${badge.kind}:${badge.tone}`}
                                                className={`rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide ${getBadgeClassName(badge.tone)}`}
                                            >
                                                {getBadgeLabel(badge, t)}
                                            </span>
                                        ))}
                                    </span>
                                ) : null}
                            </div>
                        </Button>
                    </div>
                )
            })}
        </div>
    )
})
