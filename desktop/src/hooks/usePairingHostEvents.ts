import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'
import { isTauriRuntimeAvailable, subscribePairingEvents, unsubscribePairingEvents } from '@/lib/desktopApi'
import type { PairingSessionSnapshot } from '@/types'

type PairingEventKind = 'update' | 'disconnect' | 'failure'

interface PairingEventPayload {
    pairingId: string
    kind: PairingEventKind
    data: { type?: string; pairing?: PairingSessionSnapshot } | null
    message: string | null
}

interface HostEventsOptions {
    pairingId: string | null
    eventsUrl: string | null
    onSnapshot: (snapshot: PairingSessionSnapshot) => void
}

/**
 * Subscribes to broker / hub LAN SSE for the given pairing. The Rust side
 * owns the actual EventSource (so we sidestep webview CORS) and re-emits each
 * `pairing.updated` frame as a Tauri event. The hook handles registration,
 * snapshot fan-out, and explicit teardown when the modal closes — replacing
 * the legacy 1s `refreshPairing` poll.
 */
export function usePairingHostEvents(options: HostEventsOptions): void {
    const callbackRef = useRef(options.onSnapshot)
    callbackRef.current = options.onSnapshot

    useEffect(() => {
        if (!options.pairingId || !options.eventsUrl) return
        if (!isTauriRuntimeAvailable()) return
        const pairingId = options.pairingId
        const eventsUrl = options.eventsUrl
        let unlistenFn: UnlistenFn | null = null
        let disposed = false

        async function attach(): Promise<void> {
            unlistenFn = await listen<PairingEventPayload>(`pairing-events:${pairingId}`, (event) => {
                if (disposed) return
                const payload = event.payload
                if (payload.kind !== 'update') return
                const snapshot = payload.data?.pairing
                if (snapshot) callbackRef.current(snapshot)
            })
            if (disposed) {
                unlistenFn()
                return
            }
            await subscribePairingEvents(pairingId, eventsUrl)
        }

        void attach()

        return () => {
            disposed = true
            if (unlistenFn) unlistenFn()
            void unsubscribePairingEvents(pairingId).catch(() => undefined)
        }
    }, [options.eventsUrl, options.pairingId])
}
