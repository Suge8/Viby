import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPOSER_DRAFT_TTL_MS, useComposerDraftPersistence } from './useComposerDraftPersistence'

const harness = vi.hoisted(() => ({
    composerText: '',
    setText: vi.fn()
}))

vi.mock('@assistant-ui/react', () => ({
    useAssistantApi: () => ({
        composer: () => ({
            setText: harness.setText
        })
    }),
    useAssistantState: (selector: (state: { composer: { text: string } }) => unknown) => {
        return selector({
            composer: { text: harness.composerText }
        })
    }
}))

const COMPOSER_DRAFT_STORAGE_PREFIX = 'viby-composer-draft::'

function getComposerDraftKey(sessionId: string): string {
    return `${COMPOSER_DRAFT_STORAGE_PREFIX}${sessionId}`
}

function writeStoredDraft(sessionId: string, value: string, updatedAt: number = Date.now()): void {
    window.localStorage.setItem(getComposerDraftKey(sessionId), JSON.stringify({
        value,
        updatedAt
    }))
}

function renderPersistenceHook(initialProps: {
    sessionId: string
    composerText: string
    activationKey: string
}) {
    return renderHook((props: {
        sessionId: string
        composerText: string
        activationKey: string
    }) => {
        harness.composerText = props.composerText
        useComposerDraftPersistence({
            sessionId: props.sessionId,
            activationKey: props.activationKey
        })
    }, {
        initialProps
    })
}

describe('useComposerDraftPersistence', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-03-21T12:00:00Z'))
        window.localStorage.clear()
        harness.composerText = ''
        harness.setText.mockReset()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('restores the saved draft only once for the same route activation', () => {
        writeStoredDraft('session-1', 'saved draft')

        const { rerender } = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        expect(harness.setText).toHaveBeenCalledTimes(1)
        expect(harness.setText).toHaveBeenCalledWith('saved draft')

        rerender({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        expect(harness.setText).toHaveBeenCalledTimes(1)
    })

    it('does not clear the stored draft while a new activation is still restoring it', () => {
        writeStoredDraft('session-1', 'saved draft')

        renderPersistenceHook({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        expect(harness.setText).toHaveBeenCalledWith('saved draft')
        expect(window.localStorage.getItem(getComposerDraftKey('session-1'))).toBe(JSON.stringify({
            value: 'saved draft',
            updatedAt: Date.now()
        }))
    })

    it('does not rehydrate the old draft after the current activation clears the composer', () => {
        writeStoredDraft('session-1', 'stale draft')

        const { rerender } = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: 'stale draft',
            activationKey: 'activation-a'
        })

        expect(harness.setText).not.toHaveBeenCalled()

        rerender({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        expect(harness.setText).not.toHaveBeenCalled()
        expect(window.localStorage.getItem(getComposerDraftKey('session-1'))).toBeNull()
    })

    it('restores drafts independently for each session', () => {
        writeStoredDraft('session-1', 'draft one')
        writeStoredDraft('session-2', 'draft two')

        const { rerender } = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        rerender({
            sessionId: 'session-2',
            composerText: '',
            activationKey: 'activation-b'
        })

        expect(harness.setText).toHaveBeenNthCalledWith(1, 'draft one')
        expect(harness.setText).toHaveBeenNthCalledWith(2, 'draft two')
    })

    it('restores again when the chat view remounts with a new activation key', () => {
        writeStoredDraft('session-1', 'route return draft')

        const firstRender = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: 'route return draft',
            activationKey: 'activation-a'
        })

        expect(harness.setText).not.toHaveBeenCalled()

        firstRender.unmount()

        renderPersistenceHook({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-b'
        })

        expect(harness.setText).toHaveBeenCalledTimes(1)
        expect(harness.setText).toHaveBeenCalledWith('route return draft')
    })

    it('drops expired drafts instead of restoring stale content', () => {
        writeStoredDraft('session-1', 'expired draft', Date.now() - COMPOSER_DRAFT_TTL_MS - 1)

        renderPersistenceHook({
            sessionId: 'session-1',
            composerText: '',
            activationKey: 'activation-a'
        })

        expect(harness.setText).not.toHaveBeenCalled()
        expect(window.localStorage.getItem(getComposerDraftKey('session-1'))).toBeNull()
    })

    it('flushes the latest draft on pagehide', () => {
        const { rerender } = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: 'draft one',
            activationKey: 'activation-a'
        })

        rerender({
            sessionId: 'session-1',
            composerText: 'draft two',
            activationKey: 'activation-a'
        })
        window.localStorage.removeItem(getComposerDraftKey('session-1'))

        window.dispatchEvent(new PageTransitionEvent('pagehide'))

        expect(window.localStorage.getItem(getComposerDraftKey('session-1'))).toBe(JSON.stringify({
            value: 'draft two',
            updatedAt: Date.now()
        }))
    })

    it('flushes the latest draft when the document becomes hidden', () => {
        const { rerender } = renderPersistenceHook({
            sessionId: 'session-1',
            composerText: 'draft one',
            activationKey: 'activation-a'
        })

        rerender({
            sessionId: 'session-1',
            composerText: 'draft hidden',
            activationKey: 'activation-a'
        })
        window.localStorage.removeItem(getComposerDraftKey('session-1'))

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden'
        })
        document.dispatchEvent(new Event('visibilitychange'))

        expect(window.localStorage.getItem(getComposerDraftKey('session-1'))).toBe(JSON.stringify({
            value: 'draft hidden',
            updatedAt: Date.now()
        }))
    })
})
