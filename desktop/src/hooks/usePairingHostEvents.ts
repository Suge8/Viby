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
    onInactive?: (pairingId: string) => void
}

function toHostEventSnapshot(payload: PairingEventPayload): PairingHostEventSnapshot | null {
    const pairing = payload.data?.pairing
    if (!pairing) return null
    return { ...pairing, remoteConnections: payload.data?.remoteConnections }
}

async function attachPairingHostEventTarget(options: {
    disposed: () => boolean
    onInactive?: (pairingId: string) => void
    onSnapshot: (snapshot: PairingHostEventSnapshot) => void
    target: PairingHostEventTarget
    unlistenFns: UnlistenFn[]
}): Promise<void> {
    const unlistenFn = await listen<PairingEventPayload>(`pairing-events:${options.target.pairingId}`, (event) => {
        if (options.disposed()) return
        if (event.payload.kind !== 'update') {
            options.onInactive?.(event.payload.pairingId)
            return
        }
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

function toTargetKey(targets: readonly PairingHostEventTarget[]): string {
    return targets.map((target) => `${target.pairingId}\u0000${target.eventsUrl}`).join('\u0001')
}

export function usePairingHostEvents(options: HostEventsOptions): void {
    const callbackRef = useRef(options.onSnapshot)
    const inactiveRef = useRef(options.onInactive)
    const targetsRef = useRef(options.targets)
    callbackRef.current = options.onSnapshot
    inactiveRef.current = options.onInactive
    targetsRef.current = options.targets
    const targetKey = toTargetKey(options.targets)

    useEffect(() => {
        const targets = targetsRef.current
        if (!isTauriRuntimeAvailable() || targets.length === 0) return
        const unlistenFns: UnlistenFn[] = []
        let disposed = false
        const isDisposed = (): boolean => disposed
        const onSnapshot = (snapshot: PairingHostEventSnapshot): void => callbackRef.current(snapshot)
        const onInactive = (pairingId: string): void => inactiveRef.current?.(pairingId)

        void Promise.all(
            targets.map((target) =>
                attachPairingHostEventTarget({
                    disposed: isDisposed,
                    onInactive,
                    onSnapshot,
                    target,
                    unlistenFns,
                })
            )
        )

        return () => {
            disposed = true
            for (const unlistenFn of unlistenFns) unlistenFn()
            for (const { pairingId } of targets) void unsubscribePairingEvents(pairingId).catch(() => undefined)
        }
    }, [targetKey])
}
