import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 4200

export type DesktopToastTone = 'default' | 'success'

export function useDesktopToast(): {
    message: string | null
    tone: DesktopToastTone
    showToast(message: string, durationMs?: number, tone?: DesktopToastTone): void
} {
    const [message, setMessage] = useState<string | null>(null)
    const [tone, setTone] = useState<DesktopToastTone>('default')
    const timerRef = useRef<number | null>(null)

    const showToast = useCallback(
        (nextMessage: string, durationMs = TOAST_DURATION_MS, nextTone: DesktopToastTone = 'default'): void => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current)
            }
            setTone(nextTone)
            setMessage(nextMessage)
            timerRef.current = window.setTimeout(() => {
                timerRef.current = null
                setMessage(null)
            }, durationMs)
        },
        []
    )

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) {
                window.clearTimeout(timerRef.current)
            }
        }
    }, [])

    return { message, tone, showToast }
}
