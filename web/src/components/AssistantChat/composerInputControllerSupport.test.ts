import { describe, expect, it } from 'vitest'
import {
    getNextPermissionMode,
    getSuggestionInsert,
    shouldSelectSuggestionFromKey,
} from './composerInputControllerSupport'

describe('composerInputControllerSupport', () => {
    describe('getNextPermissionMode', () => {
        it('cycles to the next permission mode in order', () => {
            expect(
                getNextPermissionMode({
                    permissionMode: 'default',
                    permissionModes: ['default', 'acceptEdits'],
                })
            ).toBe('acceptEdits')
        })

        it('wraps back to default after the last permission mode', () => {
            expect(
                getNextPermissionMode({
                    permissionMode: 'acceptEdits',
                    permissionModes: ['default', 'acceptEdits'],
                })
            ).toBe('default')
        })

        it('falls back to default when the active mode is missing from the current owner list', () => {
            expect(
                getNextPermissionMode({
                    permissionMode: 'bypassPermissions',
                    permissionModes: ['default', 'acceptEdits'],
                })
            ).toBe('default')
        })
    })

    describe('getSuggestionInsert', () => {
        it('uses canonical user content for codex user suggestions', () => {
            expect(
                getSuggestionInsert({
                    text: '$plan',
                    content: 'plan the work carefully',
                    sessionDriver: 'codex',
                    source: 'user',
                })
            ).toEqual({
                text: 'plan the work carefully',
                addSpace: false,
            })
        })

        it('keeps the displayed suggestion text for non-codex drivers', () => {
            expect(
                getSuggestionInsert({
                    text: '$plan',
                    content: 'plan the work carefully',
                    sessionDriver: 'claude',
                    source: 'user',
                })
            ).toEqual({
                text: '$plan',
                addSpace: true,
            })
        })

        it('keeps the displayed suggestion text for non-user suggestions', () => {
            expect(
                getSuggestionInsert({
                    text: '/new',
                    content: 'ignored',
                    sessionDriver: 'codex',
                    source: 'builtin',
                })
            ).toEqual({
                text: '/new',
                addSpace: true,
            })
        })

        it('keeps the displayed suggestion text when no canonical content is available', () => {
            expect(
                getSuggestionInsert({
                    text: '$focus',
                    sessionDriver: 'codex',
                    source: 'user',
                })
            ).toEqual({
                text: '$focus',
                addSpace: true,
            })
        })
    })

    describe('shouldSelectSuggestionFromKey', () => {
        it('commits the selected suggestion on Enter', () => {
            expect(
                shouldSelectSuggestionFromKey({
                    key: 'Enter',
                    shiftKey: false,
                    selectedIndex: 0,
                })
            ).toBe(true)
        })

        it('commits the selected suggestion on Tab', () => {
            expect(
                shouldSelectSuggestionFromKey({
                    key: 'Tab',
                    shiftKey: false,
                    selectedIndex: 1,
                })
            ).toBe(true)
        })

        it('keeps Shift+Enter on the newline path', () => {
            expect(
                shouldSelectSuggestionFromKey({
                    key: 'Enter',
                    shiftKey: true,
                    selectedIndex: 0,
                })
            ).toBe(false)
        })

        it('ignores commit keys when no suggestion is selected', () => {
            expect(
                shouldSelectSuggestionFromKey({
                    key: 'Enter',
                    shiftKey: false,
                    selectedIndex: -1,
                })
            ).toBe(false)
        })

        it('ignores unrelated keys', () => {
            expect(
                shouldSelectSuggestionFromKey({
                    key: 'Escape',
                    shiftKey: false,
                    selectedIndex: 0,
                })
            ).toBe(false)
        })
    })
})
