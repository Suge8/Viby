import { useEffect, useRef, useState } from 'react'
import { getPairingInviteRenewDelay } from '@/lib/desktopShellModel'
import type { DesktopPairingSession } from '@/types'

const PAIRING_INVITE_RENEW_RETRY_MS = 30_000

export function usePairingInviteAutoRenew(
    pairing: DesktopPairingSession | null,
    enabled: boolean,
    onRenew: () => Promise<boolean>
): void {
    const pendingPairingId = useRef<string | null>(null)
    const renewedPairingId = useRef<string | null>(null)
    const onRenewRef = useRef(onRenew)
    const [retryNonce, setRetryNonce] = useState(0)

    useEffect(() => {
        onRenewRef.current = onRenew
    }, [onRenew])

    useEffect(() => {
        if (!enabled) return
        const pairingId = pairing?.pairing.id ?? null
        const renewDelay = getPairingInviteRenewDelay(pairing)
        if (!pairingId || renewDelay === null || renewedPairingId.current === pairingId) return
        if (pendingPairingId.current === pairingId) return

        let active = true
        let retryTimer: number | null = null
        const renewTimer = window.setTimeout(async () => {
            pendingPairingId.current = pairingId
            let renewed = false
            try {
                renewed = await onRenewRef.current()
            } catch {
                renewed = false
            } finally {
                pendingPairingId.current = null
            }
            if (!active) return
            if (renewed) {
                renewedPairingId.current = pairingId
                return
            }
            retryTimer = window.setTimeout(() => setRetryNonce((value) => value + 1), PAIRING_INVITE_RENEW_RETRY_MS)
        }, renewDelay)
        return () => {
            active = false
            window.clearTimeout(renewTimer)
            if (retryTimer) window.clearTimeout(retryTimer)
        }
    }, [enabled, pairing, retryNonce])
}
