import { describe, expect, it } from 'vitest'
import { getSessionStatePresentation } from './sessionStatePresentation'

type PresentationInput = Parameters<typeof getSessionStatePresentation>[0]

function presentationInput(overrides: Partial<PresentationInput> = {}): PresentationInput {
    return {
        active: true,
        lifecycleState: 'running',
        thinking: false,
        activeAt: null,
        latestActivityAt: null,
        latestActivityKind: null,
        latestCompletedReplyAt: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        ...overrides,
    }
}

describe('getSessionStatePresentation', () => {
    it('keeps repeated session cards off per-row shadow layers', () => {
        const presentation = getSessionStatePresentation(presentationInput({ thinking: true }))

        expect(presentation.cardClassName).toBe('bg-[var(--app-session-processing-surface)]')
        expect(presentation.cardClassName).not.toContain('shadow')
    })

    it('keeps streaming durable replies in processing state until the ready marker arrives', () => {
        const presentation = getSessionStatePresentation(
            presentationInput({
                latestActivityAt: 2_000,
                latestActivityKind: 'reply',
                latestCompletedReplyAt: null,
            })
        )

        expect(presentation.labelKey).toBe('session.state.processing')
    })

    it('lets a transient stream mark an open session as processing', () => {
        const presentation = getSessionStatePresentation(
            presentationInput({
                lifecycleState: 'open',
                thinking: true,
            })
        )

        expect(presentation.labelKey).toBe('session.state.processing')
    })

    it('does not keep an idle session processing only because the latest completed activity is a reply', () => {
        const presentation = getSessionStatePresentation(
            presentationInput({
                latestActivityAt: 2_000,
                latestActivityKind: 'reply',
                latestCompletedReplyAt: 2_000,
            })
        )

        expect(presentation.labelKey).toBe('session.state.awaitingInput')
    })

    it('does not let a newer idle heartbeat clear an uncompleted reply', () => {
        const presentation = getSessionStatePresentation(
            presentationInput({
                activeAt: 3_000,
                latestActivityAt: 2_000,
                latestActivityKind: 'reply',
                latestCompletedReplyAt: 1_000,
            })
        )

        expect(presentation.labelKey).toBe('session.state.processing')
    })

    it('keeps inactive history sessions out of stale processing state', () => {
        const presentation = getSessionStatePresentation(
            presentationInput({
                active: false,
                lifecycleState: 'closed',
                thinking: true,
                resumeAvailable: true,
            })
        )

        expect(presentation.labelKey).toBe('session.state.history')
    })
})
