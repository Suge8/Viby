import { describe, expect, it } from 'vitest'
import {
    buildRemotePairingConnectionChrome,
    buildRemoteReconnectNotice,
    buildRemoteStatusSpec,
} from './remotePairingViewModel'

const t = (key: string, params?: Record<string, string | number>) => (params?.count ? `${key}:${params.count}` : key)

describe('remotePairingViewModel', () => {
    it('builds one chrome model for retained workspace reconnecting', () => {
        const visible = { readyWorkspaceVisible: true } as const

        expect(
            buildRemotePairingConnectionChrome({
                ...visible,
                state: { kind: 'running' },
                t,
                transportState: { kind: 'connecting', attempt: 1 },
            })
        ).toMatchObject({
            interactionBlocked: true,
            linkBadgeOverride: { label: 'remotePairing.linkBadge.reconnecting', tone: 'warning' },
            reconnect: { attempt: 1, tone: 'warning' },
        })
        expect(
            buildRemotePairingConnectionChrome({
                ...visible,
                state: { kind: 'running' },
                t,
                transportState: { kind: 'ready' },
            })
        ).toEqual({ interactionBlocked: false, linkBadgeOverride: null, reconnect: null })
        expect(
            buildRemotePairingConnectionChrome({
                readyWorkspaceVisible: false,
                state: { kind: 'hydrating' },
                t,
                transportState: { kind: 'connecting', attempt: 1 },
            }).reconnect
        ).toBeNull()
    })

    it('escalates repeated reconnect attempts to danger chrome', () => {
        const chrome = buildRemotePairingConnectionChrome({
            readyWorkspaceVisible: true,
            state: { kind: 'running' },
            t,
            transportState: { kind: 'connecting', attempt: 3 },
        })
        expect(chrome.linkBadgeOverride).toEqual({
            label: 'remotePairing.linkBadge.reconnecting',
            latency: 'remotePairing.linkBadge.retryCount:3',
            tone: 'danger',
        })
        expect(chrome.reconnect).toEqual({ attempt: 3, tone: 'danger' })
    })

    it('uses persistent notices for connection status instead of transient toasts', () => {
        const notice = buildRemoteReconnectNotice({
            action: 'action',
            reconnect: { attempt: 3, tone: 'danger' },
            t,
        })
        expect(notice).toMatchObject({
            id: 'pairing:remote-reconnecting',
            tone: 'danger',
            title: 'remotePairing.reconnectNotice.title',
            description: 'remotePairing.reconnectNotice.attemptCount:3',
        })
        expect(notice.action).toBeTruthy()
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
        expect(buildRemoteStatusSpec('remotePairing.error.updateDesktop')).toEqual({
            messageKey: 'remotePairing.error.updateDesktop',
            retry: false,
        })
        expect(buildRemoteStatusSpec('remotePairing.error.closedRetrying')).toEqual({
            messageKey: 'remotePairing.error.closedRetrying',
            retry: true,
        })
    })
})
