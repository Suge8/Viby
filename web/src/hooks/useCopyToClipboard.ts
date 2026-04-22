import { useCallback, useEffect, useRef, useState } from 'react'
import { safeCopyToClipboard } from '@/lib/clipboard'
import { COPY_FEEDBACK_DURATION_MS } from '@/lib/copyFeedback'
import { usePlatform } from './usePlatform'

export function useCopyToClipboard(resetDelay = COPY_FEEDBACK_DURATION_MS): {
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

    const copy = useCallback(
        async (text: string): Promise<boolean> => {
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
        },
        [clearResetTimer, haptic, scheduleCopiedReset]
    )

    return { copied, copy }
}
