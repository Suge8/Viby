import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { ConversationStatus } from '@/realtime/types'
import { startRealtimeSession, stopRealtimeSession, voiceHooks } from '@/realtime'

interface VoiceContextValue {
    status: ConversationStatus
    micMuted: boolean
    currentSessionId: string | null
    setStatus: (status: ConversationStatus) => void
    setMicMuted: (muted: boolean) => void
    toggleMic: () => void
    startVoice: (sessionId: string) => Promise<void>
    stopVoice: () => Promise<void>
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

export function VoiceProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<ConversationStatus>('disconnected')
    const [micMuted, setMicMuted] = useState(false)
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

    const toggleMic = useCallback(() => {
        setMicMuted((prev) => !prev)
    }, [])

    const startVoice = useCallback(async (sessionId: string) => {
        setCurrentSessionId(sessionId)
        const initialContext = voiceHooks.onVoiceStarted(sessionId)
        await startRealtimeSession(sessionId, initialContext)
    }, [])

    const stopVoice = useCallback(async () => {
        voiceHooks.onVoiceStopped()
        await stopRealtimeSession()
        setCurrentSessionId(null)
        setStatus('disconnected')
    }, [])

    return (
        <VoiceContext.Provider
            value={{
                status,
                micMuted,
                currentSessionId,
                setStatus,
                setMicMuted,
                toggleMic,
                startVoice,
                stopVoice
            }}
        >
            {children}
        </VoiceContext.Provider>
    )
}

export function useVoice(): VoiceContextValue {
    const context = useContext(VoiceContext)
    if (!context) {
        throw new Error('useVoice must be used within a VoiceProvider')
    }
    return context
}

export function useVoiceOptional(): VoiceContextValue | null {
    return useContext(VoiceContext)
}
