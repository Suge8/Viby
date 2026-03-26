import { useEffect } from 'react'
import { finalizeBootShell } from '@/lib/appRecovery'

export function useFinalizeBootShell(when: boolean = true): void {
    useEffect(() => {
        if (!when) {
            return
        }

        finalizeBootShell()
    }, [when])
}
