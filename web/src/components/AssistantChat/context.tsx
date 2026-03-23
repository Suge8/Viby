import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionMetadataSummary } from '@/types/api'

export type VibyChatContextValue = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onRefresh: () => void
    onRetryMessage?: (localId: string) => void
}

const VibyChatContext = createContext<VibyChatContextValue | null>(null)

export function VibyChatProvider(props: { value: VibyChatContextValue; children: ReactNode }) {
    return (
        <VibyChatContext.Provider value={props.value}>
            {props.children}
        </VibyChatContext.Provider>
    )
}

export function useVibyChatContext(): VibyChatContextValue {
    const ctx = useContext(VibyChatContext)
    if (!ctx) {
        throw new Error('VibyChatContext is missing')
    }
    return ctx
}
