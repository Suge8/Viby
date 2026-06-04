import { useCallback } from 'react'
import { clearRetainedReadySoon } from '@/remote/remotePairingBoot'
import { type PwaHandoffStatus, useRemotePairingPwaHandoffWarmup } from '@/remote/remotePairingPwaHandoffWarmup'

export function useRemotePairingPwaInstallStatus(options: {
    active: boolean
    closeReady(): void
    pairingId: string
    setConnectionReplaced(): void
}): PwaHandoffStatus {
    const { active, closeReady, pairingId, setConnectionReplaced } = options
    const handleCredentialRejected = useCallback(() => {
        clearRetainedReadySoon(pairingId)
        closeReady()
        setConnectionReplaced()
    }, [closeReady, pairingId, setConnectionReplaced])

    return useRemotePairingPwaHandoffWarmup({
        active,
        onCredentialRejected: handleCredentialRejected,
        pairingId,
    })
}
