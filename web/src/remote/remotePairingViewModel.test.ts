import { describe, expect, it } from 'vitest'
import {
    buildRemoteReconnectNoticeSpec,
    buildRemoteStatusSpec,
    shouldBlockRemoteReadyShellInteraction,
    shouldRenderRemoteReadyShell,
    shouldShowRemoteReconnectNotice,
} from './remotePairingViewModel'

const SESSIONS_PATH = '/sessions/session-1'

describe('remotePairingViewModel', () => {
    it('keeps retained workspace visible during reconnect and reconnect attempts', () => {
        expect(
            shouldRenderRemoteReadyShell({
                state: { kind: 'reconnecting' },
                hasRetainedReady: true,
                pathname: SESSIONS_PATH,
            })
        ).toBe(true)
        expect(
            shouldRenderRemoteReadyShell({
                state: { kind: 'booting' },
                hasRetainedReady: true,
                pathname: SESSIONS_PATH,
            })
        ).toBe(true)
    })

    it('uses the cold connection page before any workspace has been retained', () => {
        expect(
            shouldRenderRemoteReadyShell({
                state: { kind: 'reconnecting' },
                hasRetainedReady: false,
                pathname: SESSIONS_PATH,
            })
        ).toBe(false)
    })

    it('blocks stale retained workspace actions until remote bridge is ready again', () => {
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'booting' })).toBe(true)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'reconnecting' })).toBe(true)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'ready' })).toBe(false)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'approval' })).toBe(false)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'error' })).toBe(false)
    })

    it('keeps reconnect chrome compact only over retained workspace', () => {
        expect(shouldShowRemoteReconnectNotice({ kind: 'reconnecting' }, false)).toBe(false)
        expect(shouldShowRemoteReconnectNotice({ kind: 'reconnecting' }, true)).toBe(true)
        expect(shouldShowRemoteReconnectNotice({ kind: 'booting' }, true)).toBe(true)
        expect(shouldShowRemoteReconnectNotice({ kind: 'ready' }, true)).toBe(false)
    })

    it('uses one reconnect notice copy instead of attempt-based escalation', () => {
        expect(buildRemoteReconnectNoticeSpec()).toEqual({
            tone: 'info',
            titleKey: 'remotePairing.reconnectNotice.title',
        })
    })

    it('collapses raw transport errors into a small status surface set', () => {
        expect(buildRemoteStatusSpec(null)).toEqual({ messageKey: null, retry: false })
        expect(buildRemoteStatusSpec('remotePairing.error.closed')).toEqual({
            messageKey: 'remotePairing.error.fallback',
            retry: true,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.expired')).toEqual({
            messageKey: 'remotePairing.error.scanAgain',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.hostUnavailable')).toEqual({
            messageKey: 'remotePairing.error.hostClosed',
            retry: true,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.p2pTimedOut')).toEqual({
            messageKey: 'remotePairing.error.p2pBlocked',
            retry: true,
        })
    })
})
