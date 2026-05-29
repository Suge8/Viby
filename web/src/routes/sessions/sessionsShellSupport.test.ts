import { describe, expect, it } from 'vitest'
import {
    getSessionsPaneMotionState,
    isSessionsBackNavigationAction,
    shouldDispatchSessionIntent,
} from './sessionsShellSupport'

describe('sessionsShellSupport', () => {
    it('keeps the covered mobile list pane compositor-stable behind detail routes', () => {
        const state = getSessionsPaneMotionState({
            isDesktopLayout: false,
            isSessionsIndex: false,
        })

        expect(state.listPaneAnimate).toEqual({ opacity: 1, scale: 1, x: '0%' })
        expect(state.listPanePointerEvents).toBe('none')
    })

    it('skips app pane motion for mobile browser-back returns to the list', () => {
        const state = getSessionsPaneMotionState({
            isDesktopLayout: false,
            isSessionsIndex: true,
            skipPaneTransition: true,
        })

        expect(state.paneTransition).toEqual({ duration: 0 })
    })

    it('classifies backward history actions without user-agent branches', () => {
        expect(isSessionsBackNavigationAction({ type: 'BACK' })).toBe(true)
        expect(isSessionsBackNavigationAction({ type: 'GO', index: -1 })).toBe(true)
        expect(isSessionsBackNavigationAction({ type: 'FORWARD' })).toBe(false)
        expect(isSessionsBackNavigationAction({ type: 'GO', index: 1 })).toBe(false)
    })

    it('drops intent for the currently selected session', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: null,
                selectedSessionId: 'session-1',
                sessionId: 'session-1',
                source: 'hover',
                now: 100,
            })
        ).toBe(false)
    })

    it('dedupes repeated low-priority intent within the same short window', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: {
                    at: 100,
                    sessionId: 'session-1',
                    source: 'hover',
                },
                selectedSessionId: null,
                sessionId: 'session-1',
                source: 'hover',
                now: 180,
            })
        ).toBe(false)
    })

    it('allows a stronger intent source to upgrade an existing short-window hint', () => {
        expect(
            shouldDispatchSessionIntent({
                lastIntent: {
                    at: 100,
                    sessionId: 'session-1',
                    source: 'hover',
                },
                selectedSessionId: null,
                sessionId: 'session-1',
                source: 'press',
                now: 180,
            })
        ).toBe(true)
    })
})
