import { useEffect, useRef, useState } from 'react'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { createRemotePwaHandoff } from '@/remote/remotePairingHttp'

// Refresh well before the broker-side cookie TTL (30 min) so the manifest
// endpoint always recognises the workspace tab when the user opens the share
// sheet, even after long idle periods. 5 minutes matches the rotation cadence
// expected by the broker and avoids stacking refreshes during normal use.
const HANDOFF_REFRESH_INTERVAL_MS = 5 * 60 * 1_000

// The PWA install affordance must stay hidden until the warmup owner has
// completed at least one authenticated round-trip with the broker, because
// that round-trip is what sets the signed manifest cookie the server reads
// when iOS Safari fetches `/manifest.webmanifest` at "Add to Home Screen".
export type PwaHandoffStatus = 'idle' | 'preparing' | 'ready' | 'failed'

/**
 * Owns the lifecycle of the broker-side pairing manifest cookie while the
 * remote pairing controller is in the `ready` state. Each authenticated
 * round-trip refreshes a signed HttpOnly cookie that the broker reads when
 * iOS Safari fetches `/manifest.webmanifest` at "Add to Home Screen" time.
 * The manifest endpoint then issues a one-shot handoff ticket inline and
 * returns a personalized `start_url`, so the workspace tab no longer needs
 * to coordinate the handoff through JS DOM mutation or Service Worker
 * interception — both of which iOS Safari can silently ignore.
 *
 * The status return value gates the install banner: until at least one
 * round-trip has succeeded, the cookie is missing and iOS Safari would only
 * read the unauthenticated fallback manifest, so the install affordance
 * stays unmounted.
 */
export function useRemotePairingPwaHandoffWarmup(props: { pairingId: string; active: boolean }): PwaHandoffStatus {
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
        }
    }, [props.active, props.pairingId])

    return status
}
