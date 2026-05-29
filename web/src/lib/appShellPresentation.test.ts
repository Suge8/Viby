import { describe, expect, it } from 'vitest'
import {
    getAppViewportRoute,
    getSelectedSessionId,
    shouldRestoreWindowScroll,
    shouldSuppressInstallPrompt,
} from './appShellPresentation'

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

    it('keeps install prompt available on the sessions list and suppresses it in chat', () => {
        expect(
            shouldSuppressInstallPrompt({
                isReady: true,
                isAuthLoading: false,
                bannerKind: 'hidden',
                pathname: '/sessions',
            })
        ).toBe(false)
        expect(
            shouldSuppressInstallPrompt({
                isReady: true,
                isAuthLoading: false,
                bannerKind: 'hidden',
                pathname: '/sessions/session-1',
            })
        ).toBe(true)
    })

    it('keeps realtime notices above the install prompt outside sessions workspace', () => {
        expect(
            shouldSuppressInstallPrompt({
                isReady: true,
                isAuthLoading: false,
                bannerKind: 'busy',
                pathname: '/other',
            })
        ).toBe(true)
        expect(
            shouldSuppressInstallPrompt({
                isReady: true,
                isAuthLoading: false,
                bannerKind: 'hidden',
                pathname: '/other',
            })
        ).toBe(false)
    })
})
