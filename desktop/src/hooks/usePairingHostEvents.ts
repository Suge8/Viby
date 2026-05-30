import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'
import { isTauriRuntimeAvailable, subscribePairingEvents, unsubscribePairingEvents } from '@/lib/desktopApi'
import type { DesktopPairingSnapshot, PairingRemoteConnectionSnapshot, PairingSessionSnapshot } from '@/types'

type PairingEventKind = 'update' | 'disconnect' | 'failure'

export type PairingHostEventTarget = {
    pairingId: string
    eventsUrl: string
}

type PairingHostEventSnapshot = PairingSessionSnapshot & Partial<DesktopPairingSnapshot>

interface PairingEventPayload {
    pairingId: string
    kind: PairingEventKind
    data: {
        type?: string
        pairing?: PairingSessionSnapshot
        remoteConnections?: PairingRemoteConnectionSnapshot[]
    } | null
    message: string | null
}

interface HostEventsOptions {
    targets: readonly PairingHostEventTarget[]
    onSnapshot: (snapshot: PairingHostEventSnapshot) => void
}

function toHostEventSnapshot(payload: PairingEventPayload): PairingHostEventSnapshot | null {
    const pairing = payload.data?.pairing
    if (!pairing) return null
    return { ...pairing, remoteConnections: payload.data?.remoteConnections }
}

async function attachPairingHostEventTarget(options: {
    disposed: () => boolean
    onSnapshot: (snapshot: PairingHostEventSnapshot) => void
    target: PairingHostEventTarget
    unlistenFns: UnlistenFn[]
}): Promise<void> {
    const unlistenFn = await listen<PairingEventPayload>(`pairing-events:${options.target.pairingId}`, (event) => {
        if (options.disposed() || event.payload.kind !== 'update') return
        const snapshot = toHostEventSnapshot(event.payload)
        if (snapshot) options.onSnapshot(snapshot)
    })
    options.unlistenFns.push(unlistenFn)
    if (options.disposed()) {
        unlistenFn()
        return
    }
    await subscribePairingEvents(options.target.pairingId, options.target.eventsUrl)
    if (options.disposed()) await unsubscribePairingEvents(options.target.pairingId).catch(() => undefined)
}

export function usePairingHostEvents(options: HostEventsOptions): void {
    const callbackRef = useRef(options.onSnapshot)
    callbackRef.current = options.onSnapshot

    useEffect(() => {
        if (!isTauriRuntimeAvailable() || options.targets.length === 0) return
        const unlistenFns: UnlistenFn[] = []
        let disposed = false
        const isDisposed = (): boolean => disposed
        const onSnapshot = (snapshot: PairingHostEventSnapshot): void => callbackRef.current(snapshot)

        void Promise.all(
            options.targets.map((target) =>
                attachPairingHostEventTarget({
                    disposed: isDisposed,
                    onSnapshot,
                    target,
                    unlistenFns,
                })
            )
        )

        return () => {
            disposed = true
            for (const unlistenFn of unlistenFns) unlistenFn()
            for (const { pairingId } of options.targets) void unsubscribePairingEvents(pairingId).catch(() => undefined)
        }
    }, [options.targets])
}
