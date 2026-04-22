import { describe, expect, it } from 'vitest'
import {
    resolveVisibleTranscriptConversationId,
    resolveVisibleTranscriptHistoryJumpTargetConversationId,
} from './transcriptVisibleRows'

describe('resolveVisibleTranscriptConversationId', () => {
    it('uses the top-anchor comfort line instead of the raw viewport top', () => {
        const page = document.createElement('div')
        page.className = 'session-chat-page'
        page.style.setProperty('--chat-header-anchor-space', '72px')

        const viewport = document.createElement('div')
        page.appendChild(viewport)
        document.body.appendChild(page)

        const hiddenTopRow = document.createElement('div')
        hiddenTopRow.dataset.conversationId = 'conversation-hidden-top'
        hiddenTopRow.dataset.testid = 'transcript-row'
        hiddenTopRow.getBoundingClientRect = () =>
            ({
                top: 100,
                bottom: 146,
            }) as DOMRect

        const anchoredRow = document.createElement('div')
        anchoredRow.dataset.conversationId = 'conversation-anchored'
        anchoredRow.dataset.testid = 'transcript-row'
        anchoredRow.getBoundingClientRect = () =>
            ({
                top: 166,
                bottom: 244,
            }) as DOMRect

        viewport.getBoundingClientRect = () =>
            ({
                top: 80,
                bottom: 480,
            }) as DOMRect
        viewport.querySelectorAll = (() => [hiddenTopRow, anchoredRow]) as unknown as typeof viewport.querySelectorAll

        expect(resolveVisibleTranscriptConversationId({ viewport })).toBe('conversation-anchored')

        page.remove()
    })

    it('uses the visible user jump target instead of an assistant row for history navigation', () => {
        const page = document.createElement('div')
        page.className = 'session-chat-page'
        page.style.setProperty('--chat-header-anchor-space', '72px')

        const viewport = document.createElement('div')
        page.appendChild(viewport)
        document.body.appendChild(page)

        const userRow = document.createElement('div')
        userRow.dataset.conversationId = 'conversation-user-3'
        userRow.dataset.historyJumpTarget = 'true'
        userRow.dataset.testid = 'transcript-row'
        userRow.getBoundingClientRect = () =>
            ({
                top: 166,
                bottom: 244,
            }) as DOMRect

        const assistantRow = document.createElement('div')
        assistantRow.dataset.conversationId = 'conversation-assistant-4'
        assistantRow.dataset.testid = 'transcript-row'
        assistantRow.getBoundingClientRect = () =>
            ({
                top: 250,
                bottom: 340,
            }) as DOMRect

        viewport.getBoundingClientRect = () =>
            ({
                top: 80,
                bottom: 480,
            }) as DOMRect
        viewport.querySelectorAll = ((selector: string) => {
            if (selector.includes('data-history-jump-target')) {
                return [userRow] as unknown as NodeListOf<HTMLElement>
            }
            return [assistantRow, userRow] as unknown as NodeListOf<HTMLElement>
        }) as typeof viewport.querySelectorAll

        expect(resolveVisibleTranscriptConversationId({ viewport })).toBe('conversation-assistant-4')
        expect(resolveVisibleTranscriptHistoryJumpTargetConversationId({ viewport })).toBe('conversation-user-3')

        page.remove()
    })
})
