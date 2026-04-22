import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removeComposerDraftFromIndexedDb } from '@/components/AssistantChat/composerDraftIndexedDb'
import {
    COMPOSER_DRAFT_TTL_MS,
    readComposerDraftFromIndexedDb,
    resetComposerDraftPersistenceForTests,
    seedComposerDraftForTests,
} from '@/components/AssistantChat/composerDraftStore'
import { useComposerDraftPersistence } from './useComposerDraftPersistence'

const harness = vi.hoisted(() => ({
    composerText: '',
    setText: vi.fn(),
}))

vi.mock('@assistant-ui/react', () => ({
    useAssistantApi: () => ({
        composer: () => ({
            setText: harness.setText,
        }),
    }),
    useAssistantState: (selector: (state: { composer: { text: string } }) => unknown) => {
        return selector({
            composer: { text: harness.composerText },
        })
    },
}))

function renderPersistenceHook(initialProps: { activationKey: string; composerText: string; sessionId: string }) {
    return renderHook(
        (props: { activationKey: string; composerText: string; sessionId: string }) => {
            harness.composerText = props.composerText
            useComposerDraftPersistence({
                activationKey: props.activationKey,
                sessionId: props.sessionId,
            })
        },
        {
            initialProps,
        }
    )
}

async function expectIndexedDbDraft(sessionId: string, expectedValue: string | null): Promise<void> {
    await waitFor(async () => {
        const result = await readComposerDraftFromIndexedDb(sessionId, Date.now())
        expect(result.value).toBe(expectedValue)
    })
}

describe('useComposerDraftPersistence', () => {
    beforeEach(async () => {
        vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-03-21T12:00:00Z').getTime())
        await resetComposerDraftPersistenceForTests()
        harness.composerText = ''
        harness.setText.mockReset()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('restores the saved draft only once for the same route activation', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'saved draft',
        })

        const { rerender } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenCalledTimes(1)
            expect(harness.setText).toHaveBeenCalledWith('saved draft')
        })

        rerender({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        expect(harness.setText).toHaveBeenCalledTimes(1)
    })

    it('does not clear the stored draft while a new activation is still restoring it', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'saved draft',
        })

        renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenCalledWith('saved draft')
        })
        await expectIndexedDbDraft('session-1', 'saved draft')
    })

    it('does not remove an existing draft on an empty remount before restore finishes', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'draft survives remount',
        })

        const firstRender = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'draft survives remount',
            sessionId: 'session-1',
        })

        firstRender.unmount()

        harness.setText.mockClear()
        renderPersistenceHook({
            activationKey: 'activation-b',
            composerText: '',
            sessionId: 'session-1',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenCalledWith('draft survives remount')
        })
        await expectIndexedDbDraft('session-1', 'draft survives remount')
    })

    it('preserves the last non-empty draft when runtime transitions the composer to empty', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'stale draft',
        })

        const { rerender } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'stale draft',
            sessionId: 'session-1',
        })

        expect(harness.setText).not.toHaveBeenCalled()

        rerender({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        expect(harness.setText).not.toHaveBeenCalled()
        await expectIndexedDbDraft('session-1', 'stale draft')
    })

    it('restores drafts independently for each session', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'draft one',
        })
        await seedComposerDraftForTests('session-2', {
            updatedAt: Date.now(),
            value: 'draft two',
        })

        const { rerender } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenNthCalledWith(1, 'draft one')
        })

        rerender({
            activationKey: 'activation-b',
            composerText: '',
            sessionId: 'session-2',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenNthCalledWith(2, 'draft two')
        })
    })

    it('restores again when the chat view remounts with a new activation key', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now(),
            value: 'route return draft',
        })

        const firstRender = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'route return draft',
            sessionId: 'session-1',
        })

        expect(harness.setText).not.toHaveBeenCalled()

        firstRender.unmount()

        renderPersistenceHook({
            activationKey: 'activation-b',
            composerText: '',
            sessionId: 'session-1',
        })

        await waitFor(() => {
            expect(harness.setText).toHaveBeenCalledTimes(1)
            expect(harness.setText).toHaveBeenCalledWith('route return draft')
        })
    })

    it('restores from the in-memory hot cache even when the durable cache is empty', async () => {
        const firstRender = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'memory draft',
            sessionId: 'session-1',
        })

        firstRender.unmount()
        await removeComposerDraftFromIndexedDb('session-1')
        harness.setText.mockClear()

        renderPersistenceHook({
            activationKey: 'activation-b',
            composerText: '',
            sessionId: 'session-1',
        })

        expect(harness.setText).toHaveBeenCalledWith('memory draft')
    })

    it('drops expired drafts instead of restoring stale content', async () => {
        await seedComposerDraftForTests('session-1', {
            updatedAt: Date.now() - COMPOSER_DRAFT_TTL_MS - 1,
            value: 'expired draft',
        })

        renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: '',
            sessionId: 'session-1',
        })

        expect(harness.setText).not.toHaveBeenCalled()
        await expectIndexedDbDraft('session-1', null)
    })

    it('flushes the latest draft on pagehide', async () => {
        const { rerender } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'draft one',
            sessionId: 'session-1',
        })

        rerender({
            activationKey: 'activation-a',
            composerText: 'draft two',
            sessionId: 'session-1',
        })

        window.dispatchEvent(new PageTransitionEvent('pagehide'))

        await expectIndexedDbDraft('session-1', 'draft two')
    })

    it('flushes the latest draft on unmount', async () => {
        const { rerender, unmount } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'draft one',
            sessionId: 'session-1',
        })

        rerender({
            activationKey: 'activation-a',
            composerText: 'draft on unmount',
            sessionId: 'session-1',
        })

        unmount()

        await expectIndexedDbDraft('session-1', 'draft on unmount')
    })

    it('flushes the latest draft when the document becomes hidden', async () => {
        const { rerender } = renderPersistenceHook({
            activationKey: 'activation-a',
            composerText: 'draft one',
            sessionId: 'session-1',
        })

        rerender({
            activationKey: 'activation-a',
            composerText: 'draft hidden',
            sessionId: 'session-1',
        })

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        })
        document.dispatchEvent(new Event('visibilitychange'))

        await expectIndexedDbDraft('session-1', 'draft hidden')
    })
})
