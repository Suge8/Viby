import { describe, expect, it } from 'vitest'
import { getAppViewportRoute, getSelectedSessionId, shouldRestoreWindowScroll } from './appShellPresentation'

describe('appShellPresentation', () => {
    it('classifies direct session routes as chat viewports', () => {
        expect(getAppViewportRoute('/sessions/session-1')).toBe('session-chat')
        expect(getAppViewportRoute('/sessions/new')).toBe('default')
        expect(getAppViewportRoute('/sessions/settings')).toBe('default')
        expect(getAppViewportRoute('/sessions/session-1/files')).toBe('default')
    })

    it('disables window scroll restoration for chat routes only', () => {
        expect(shouldRestoreWindowScroll('/sessions/session-1')).toBe(false)
        expect(shouldRestoreWindowScroll('/sessions/session-1/')).toBe(false)
        expect(shouldRestoreWindowScroll('/sessions/session-1/files')).toBe(true)
        expect(shouldRestoreWindowScroll('/sessions')).toBe(true)
        expect(shouldRestoreWindowScroll('/sessions/settings')).toBe(true)
    })

    it('ignores reserved sessions child routes when resolving the selected session', () => {
        expect(getSelectedSessionId({ sessionId: 'session-1' })).toBe('session-1')
        expect(getSelectedSessionId({ sessionId: 'new' })).toBeNull()
        expect(getSelectedSessionId({ sessionId: 'settings' })).toBeNull()
    })
})
