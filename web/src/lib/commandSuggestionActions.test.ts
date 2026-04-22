import { describe, expect, it } from 'vitest'
import { resolveCommandSuggestionNavigation } from './commandSuggestionActions'

describe('commandSuggestionActions', () => {
    it('maps new-session actions into Viby navigation targets', () => {
        expect(
            resolveCommandSuggestionNavigation({
                key: 'new',
                text: '/new',
                label: '/new',
                actionType: 'open_new_session',
            })
        ).toEqual({ to: '/sessions/new' })
    })

    it('returns null when a suggestion has no product action mapping', () => {
        expect(
            resolveCommandSuggestionNavigation({
                key: 'status',
                text: '/status',
                label: '/status',
            })
        ).toBeNull()
    })
})
