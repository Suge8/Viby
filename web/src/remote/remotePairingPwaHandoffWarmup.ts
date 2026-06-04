import { PAIRING_PWA_MANIFEST_PAIRING_PARAM } from '@viby/protocol'
import { useEffect, useRef, useState } from 'react'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { createRemotePwaHandoff, isRemotePairingTokenRejected } from '@/remote/remotePairingHttp'

// Refresh well before the broker-side cookie TTL (30 min) so the manifest
// endpoint always recognises the workspace tab when the user opens the share
// sheet, even after long idle periods. 5 minutes matches the rotation cadence
// expected by the broker and avoids stacking refreshes during normal use.
const HANDOFF_REFRESH_INTERVAL_MS = 5 * 60 * 1_000

const MANIFEST_LINK_SELECTOR = 'link[rel="manifest"]'
const DEFAULT_MANIFEST_HREF = '/manifest.webmanifest'

// The PWA install affordance must stay hidden until the warmup owner has
// completed at least one authenticated round-trip with the broker, because
// that round-trip sets the signed manifest cookie and proves the current
// pairing is installable.
export type PwaHandoffStatus = 'idle' | 'preparing' | 'ready' | 'failed'

function bindPairingManifestLink(pairingId: string): () => void {
    const link = document.querySelector<HTMLLinkElement>(MANIFEST_LINK_SELECTOR)
    if (!link) return () => undefined

    const previousHref = link.getAttribute('href') ?? DEFAULT_MANIFEST_HREF
    const nextUrl = new URL(previousHref, window.location.origin)
    nextUrl.pathname = nextUrl.pathname || DEFAULT_MANIFEST_HREF
    nextUrl.searchParams.set(PAIRING_PWA_MANIFEST_PAIRING_PARAM, pairingId)
    link.setAttribute('href', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`)

    return () => {
        if (link.isConnected) link.setAttribute('href', previousHref)
    }
}

/**
 * Owns the PWA install binding while the remote pairing controller is ready.
 * The manifest URL carries the public pairing id, which survives standalone
 * storage isolation; the cookie stays as a second channel for platforms that
 * preserve it during the install flow. The broker mints the one-shot handoff
 * only when the manifest is fetched.
 *
 * The status return value gates the install banner: until at least one
 * round-trip has succeeded, the install affordance stays unmounted.
 */
export function useRemotePairingPwaHandoffWarmup(props: {
    active: boolean
    onCredentialRejected?: () => void
    pairingId: string
}): PwaHandoffStatus {
    const inFlightRef = useRef<Promise<unknown> | null>(null)
    const generationRef = useRef(0)
    const [status, setStatus] = useState<PwaHandoffStatus>('idle')

    useEffect(() => {
        // A new pairing id is a new cookie lineage; cancel any in-flight call
        // tied to the old pairing so a late response cannot land on the new
        // manifest binding.
        inFlightRef.current = null
        generationRef.current += 1
        setStatus('idle')
    }, [props.pairingId])

    useEffect(() => {
        if (!props.active) {
            setStatus('idle')
            return
        }
        const generation = generationRef.current
        let disposed = false
        const restoreManifestLink = bindPairingManifestLink(props.pairingId)

        async function refresh(initial: boolean): Promise<void> {
            if (disposed || generation !== generationRef.current) return
            // Only the first refresh flips the visible status to `preparing`;
            // background rotations keep the banner stable on the previous
            // `ready` state so the install affordance does not blink during
            // routine cookie churn.
            if (initial) setStatus('preparing')
            try {
                inFlightRef.current ??= createRemotePwaHandoff(props.pairingId)
                const handoff = await inFlightRef.current
                if (disposed || generation !== generationRef.current) return
                setStatus(handoff ? 'ready' : 'failed')
            } catch (error) {
                if (isRemotePairingTokenRejected(error)) {
                    props.onCredentialRejected?.()
                    return
                }
                reportWebRuntimeError('Failed to prepare PWA install handoff.', error)
                if (initial) setStatus('failed')
            } finally {
                if (generation === generationRef.current) {
                    inFlightRef.current = null
                }
            }
        }

        void refresh(true)
        const intervalId = window.setInterval(() => void refresh(false), HANDOFF_REFRESH_INTERVAL_MS)

        return () => {
            disposed = true
            window.clearInterval(intervalId)
            restoreManifestLink()
        }
    }, [props.active, props.onCredentialRejected, props.pairingId])

    return status
}
