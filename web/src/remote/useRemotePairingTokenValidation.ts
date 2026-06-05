import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeBrowserRecoveryIntent } from '@/lib/browserRecoveryIntent'
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
    const validatingTokenRef = useRef<string | null>(null)
    const [validationGeneration, setValidationGeneration] = useState(0)

    const invalidateVisibleValidation = useCallback(() => {
        if (document.visibilityState === 'hidden') return
        validatedTokenRef.current = null
        setValidationGeneration((generation) => generation + 1)
    }, [])

    useEffect(() => {
        if (reconnect) return
        validatedTokenRef.current = null
        validatingTokenRef.current = null
    }, [reconnect])

    useEffect(() => {
        return subscribeBrowserRecoveryIntent((intent) => {
            if (intent.kind === 'foreground') invalidateVisibleValidation()
        })
    }, [invalidateVisibleValidation])

    useEffect(() => {
        if (!activeReady || !reconnect) return
        const token = activeReady.token
        if (validatedTokenRef.current === token || validatingTokenRef.current === token) return
        validatedTokenRef.current = token
        validatingTokenRef.current = token
        let disposed = false
        void validateRemotePairingToken(pairingId, token)
            .then(() => {
                if (validatingTokenRef.current === token) validatedTokenRef.current = token
            })
            .catch((error) => {
                if (disposed) return
                if (!(error instanceof RemotePairingHttpError && error.serverCode === 'pairing_invalid_token')) return
                clearRetainedReadySoon(pairingId)
                closeReady()
                setConnectionReplaced()
            })
            .finally(() => {
                if (validatingTokenRef.current === token) validatingTokenRef.current = null
            })
        return () => {
            disposed = true
        }
    }, [activeReady, closeReady, pairingId, reconnect, setConnectionReplaced, validationGeneration])
}
