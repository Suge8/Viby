import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlatform } from './usePlatform'
import { safeCopyToClipboard } from '@/lib/clipboard'

const DEFAULT_COPY_RESET_DELAY_MS = 1_500

export function useCopyToClipboard(resetDelay = DEFAULT_COPY_RESET_DELAY_MS): {
    copied: boolean
    copy: (text: string) => Promise<boolean>
} {
    const [copied, setCopied] = useState(false)
    const { haptic } = usePlatform()
    const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearResetTimer = useCallback((): void => {
        if (!resetTimerRef.current) {
            return
        }

        clearTimeout(resetTimerRef.current)
        resetTimerRef.current = null
    }, [])

    const scheduleCopiedReset = useCallback((): void => {
        clearResetTimer()
        resetTimerRef.current = setTimeout(() => {
            resetTimerRef.current = null
            setCopied(false)
        }, resetDelay)
    }, [clearResetTimer, resetDelay])

    useEffect(() => {
        return () => {
            clearResetTimer()
        }
    }, [clearResetTimer])

    const copy = useCallback(async (text: string): Promise<boolean> => {
        try {
            await safeCopyToClipboard(text)
            haptic.notification('success')
            setCopied(true)
            scheduleCopiedReset()
            return true
        } catch {
            clearResetTimer()
            setCopied(false)
            haptic.notification('error')
            return false
        }
    }, [clearResetTimer, haptic, scheduleCopiedReset])

    return { copied, copy }
}
