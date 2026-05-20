import { describe, expect, it } from 'vitest'
import {
    buildRemoteStatusSpec,
    shouldBlockRemoteReadyShellInteraction,
    shouldShowRemoteReconnectNotice,
} from './remotePairingViewModel'

describe('remotePairingViewModel', () => {
    it('shows reconnect chrome only while a running workspace transport is reconnecting', () => {
        const visible = { readyWorkspaceVisible: true } as const
        expect(
            shouldShowRemoteReconnectNotice({ ...visible, state: { kind: 'running' }, transportKind: 'connecting' })
        ).toBe(true)
        expect(
            shouldShowRemoteReconnectNotice({ ...visible, state: { kind: 'running' }, transportKind: 'ready' })
        ).toBe(false)
        expect(
            shouldShowRemoteReconnectNotice({ ...visible, state: { kind: 'hydrating' }, transportKind: 'connecting' })
        ).toBe(true)
        expect(
            shouldShowRemoteReconnectNotice({
                readyWorkspaceVisible: false,
                state: { kind: 'hydrating' },
                transportKind: 'connecting',
            })
        ).toBe(false)
        expect(
            shouldShowRemoteReconnectNotice({
                ...visible,
                state: { kind: 'first-pairing' },
                transportKind: 'connecting',
            })
        ).toBe(false)
        expect(
            shouldShowRemoteReconnectNotice({ ...visible, state: { kind: 'fatal' }, transportKind: 'connecting' })
        ).toBe(false)
    })

    it('blocks workspace actions outside the running state', () => {
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'running' }, false)).toBe(false)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'running' }, true)).toBe(true)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'hydrating' }, false)).toBe(true)
        expect(shouldBlockRemoteReadyShellInteraction({ kind: 'fatal' }, false)).toBe(true)
    })

    it('collapses status errors into a small surface set', () => {
        expect(buildRemoteStatusSpec(null)).toEqual({ messageKey: null, retry: false })
        expect(buildRemoteStatusSpec('remotePairing.error.scanAgain')).toEqual({
            messageKey: 'remotePairing.error.scanAgain',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.regenerateQr')).toEqual({
            messageKey: 'remotePairing.error.regenerateQr',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.closedRetrying')).toEqual({
            messageKey: 'remotePairing.error.closedRetrying',
            retry: true,
        })
    })
})
