import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PwaHandoffStatus } from './remotePairingPwaHandoffWarmup'

const httpMock = vi.hoisted(() => ({
    createRemotePwaHandoff: vi.fn(),
}))

vi.mock('@/remote/remotePairingHttp', () => httpMock)

vi.mock('@/lib/runtimeDiagnostics', () => ({
    reportWebRuntimeError: vi.fn(),
}))

import { useRemotePairingPwaHandoffWarmup } from './remotePairingPwaHandoffWarmup'

function WarmupProbe(props: { pairingId: string; active: boolean }) {
    const status = useRemotePairingPwaHandoffWarmup(props)
    return <span data-testid="status">{status}</span>
}

function readStatus(): PwaHandoffStatus {
    return document.querySelector<HTMLSpanElement>('[data-testid="status"]')?.textContent as PwaHandoffStatus
}

async function waitForStatus(target: PwaHandoffStatus): Promise<void> {
    await waitFor(() => expect(readStatus()).toBe(target))
}

describe('useRemotePairingPwaHandoffWarmup', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.resetAllMocks()
        document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials">'
        window.history.replaceState({}, '', '/sessions?remote=1')
    })

    afterEach(() => {
        cleanup()
        document.head.innerHTML = ''
        vi.useRealTimers()
    })

    it('flips to `ready` after the first authenticated round-trip so the install banner can mount knowing the manifest cookie is set', async () => {
        httpMock.createRemotePwaHandoff.mockResolvedValue({
            handoffTicket: 'ticket-1',
            expiresAt: Date.now() + 600_000,
        })

        render(<WarmupProbe pairingId="pairing-1" active />)
        await waitForStatus('ready')

        expect(httpMock.createRemotePwaHandoff).toHaveBeenCalledTimes(1)
        expect(httpMock.createRemotePwaHandoff).toHaveBeenCalledWith('pairing-1')
        expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
            '/manifest.webmanifest?pairing=pairing-1'
        )
    })

    it('binds the manifest URL to the current pairing so iOS Chrome PWA install does not depend on browser-tab storage', async () => {
        httpMock.createRemotePwaHandoff.mockResolvedValue({
            handoffTicket: 'ticket-1',
            expiresAt: Date.now() + 600_000,
        })
        const { unmount } = render(<WarmupProbe pairingId="pairing-1" active />)

        await waitForStatus('ready')
        expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
            '/manifest.webmanifest?pairing=pairing-1'
        )

        unmount()
        expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
            '/manifest.webmanifest'
        )
    })

    it('replaces a stale manifest pairing when the controller moves to a new pairing id', async () => {
        document.head.innerHTML = '<link rel="manifest" href="/manifest.webmanifest?pairing=old">'
        httpMock.createRemotePwaHandoff
            .mockResolvedValueOnce({ handoffTicket: 'ticket-old', expiresAt: Date.now() + 600_000 })
            .mockResolvedValueOnce({ handoffTicket: 'ticket-new', expiresAt: Date.now() + 600_000 })

        const { rerender } = render(<WarmupProbe pairingId="pairing-1" active />)
        await waitForStatus('ready')
        expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
            '/manifest.webmanifest?pairing=pairing-1'
        )

        rerender(<WarmupProbe pairingId="pairing-2" active />)
        await waitForStatus('ready')

        expect(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href')).toBe(
            '/manifest.webmanifest?pairing=pairing-2'
        )
    })

    it('stays idle while the controller is not ready so we never burn handoff tickets prematurely', () => {
        httpMock.createRemotePwaHandoff.mockResolvedValue({
            handoffTicket: 'ticket-1',
            expiresAt: Date.now() + 600_000,
        })

        render(<WarmupProbe pairingId="pairing-1" active={false} />)

        expect(httpMock.createRemotePwaHandoff).not.toHaveBeenCalled()
        expect(readStatus()).toBe('idle')
    })

    it('reports `failed` when the broker rejects so the install affordance never appears with a stale cookie', async () => {
        httpMock.createRemotePwaHandoff.mockRejectedValue(new Error('broker down'))

        render(<WarmupProbe pairingId="pairing-1" active />)
        await waitForStatus('failed')
    })

    it('refreshes the manifest cookie every 5 minutes so an idle workspace tab survives long share-sheet delays', async () => {
        httpMock.createRemotePwaHandoff
            .mockResolvedValueOnce({ handoffTicket: 'ticket-1', expiresAt: Date.now() + 600_000 })
            .mockResolvedValueOnce({ handoffTicket: 'ticket-2', expiresAt: Date.now() + 600_000 })

        render(<WarmupProbe pairingId="pairing-1" active />)
        await waitForStatus('ready')
        expect(httpMock.createRemotePwaHandoff).toHaveBeenCalledTimes(1)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5 * 60 * 1_000)
        })

        await waitFor(() => expect(httpMock.createRemotePwaHandoff).toHaveBeenCalledTimes(2))
    })

    it('resets to idle when the pairing identity changes so a stale ready state cannot leak into the new pairing', async () => {
        httpMock.createRemotePwaHandoff
            .mockResolvedValueOnce({ handoffTicket: 'ticket-old', expiresAt: Date.now() + 600_000 })
            .mockResolvedValueOnce({ handoffTicket: 'ticket-new', expiresAt: Date.now() + 600_000 })

        const { rerender } = render(<WarmupProbe pairingId="pairing-1" active />)
        await waitForStatus('ready')

        rerender(<WarmupProbe pairingId="pairing-2" active />)
        await waitForStatus('ready')

        expect(httpMock.createRemotePwaHandoff).toHaveBeenLastCalledWith('pairing-2')
    })
})
