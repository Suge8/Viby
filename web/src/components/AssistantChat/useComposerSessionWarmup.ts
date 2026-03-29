import { useCallback, useEffect, useRef } from 'react'

type UseComposerSessionWarmupOptions = {
    active: boolean
    isResuming: boolean
    onWarmSession?: () => void
}

type ComposerSessionWarmupHandler = (value: string) => void

export function useComposerSessionWarmup(
    options: UseComposerSessionWarmupOptions
): ComposerSessionWarmupHandler {
    const { active, isResuming, onWarmSession } = options
    const warmupRequestedRef = useRef(false)

    useEffect(() => {
        if (active || isResuming) {
            warmupRequestedRef.current = false
        }
    }, [active, isResuming])

    const requestWarmup = useCallback(() => {
        if (active || isResuming || !onWarmSession || warmupRequestedRef.current) {
            return
        }

        warmupRequestedRef.current = true
        onWarmSession()
    }, [active, isResuming, onWarmSession])

    const handleTextIntent = useCallback((value: string) => {
        if (value.trim().length === 0) {
            return
        }

        requestWarmup()
    }, [requestWarmup])

    return handleTextIntent
}
