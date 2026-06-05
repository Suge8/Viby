import { useSyncExternalStore } from 'react'
import { getBrowserOnlineSnapshot, subscribeBrowserRecoveryIntent } from '@/lib/browserRecoveryIntent'

function subscribe(callback: () => void): () => void {
    return subscribeBrowserRecoveryIntent((intent) => {
        if (intent.kind === 'online-changed') callback()
    })
}

function getServerSnapshot(): boolean {
    return true
}

export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribe, getBrowserOnlineSnapshot, getServerSnapshot)
}
