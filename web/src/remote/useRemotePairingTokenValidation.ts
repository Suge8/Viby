import { useCallback, useEffect, useRef, useState } from 'react'
import { clearRetainedReadySoon } from '@/remote/remotePairingBoot'
import { RemotePairingHttpError, validateRemotePairingToken } from '@/remote/remotePairingHttp'
import type { RemotePairingReadyConnection } from './RemotePairingReadyShell'
import type { RemotePairingReconnectStatus } from './remotePairingViewModel'

export function useRemotePairingTokenValidation(options: {
    activeReady: RemotePairingReadyConnection | null
    closeReady(): void
    pairingId: string
    reconnect: RemotePairingReconnectStatus | null
    setConnectionReplaced(): void
}): void {
    const { activeReady, closeReady, pairingId, reconnect, setConnectionReplaced } = options
    const validatedTokenRef = useRef<string | null>(null)
    const [validationGeneration, setValidationGeneration] = useState(0)

    const invalidateValidation = useCallback(() => {
        validatedTokenRef.current = null
        setValidationGeneration((generation) => generation + 1)
    }, [])

    useEffect(() => {
        if (!reconnect) validatedTokenRef.current = null
    }, [reconnect])

    useEffect(() => {
        window.addEventListener('focus', invalidateValidation)
        document.addEventListener('visibilitychange', invalidateValidation)
        return () => {
            window.removeEventListener('focus', invalidateValidation)
            document.removeEventListener('visibilitychange', invalidateValidation)
        }
    }, [invalidateValidation])

    useEffect(() => {
        if (!activeReady || !reconnect) return
        const token = activeReady.token
        if (validatedTokenRef.current === token) return
        validatedTokenRef.current = token
        let disposed = false
        void validateRemotePairingToken(pairingId, token).catch((error) => {
            if (disposed) return
            if (!(error instanceof RemotePairingHttpError && error.serverCode === 'pairing_invalid_token')) return
            clearRetainedReadySoon(pairingId)
            closeReady()
            setConnectionReplaced()
        })
        return () => {
            disposed = true
        }
    }, [activeReady, closeReady, pairingId, reconnect, setConnectionReplaced, validationGeneration])
}
