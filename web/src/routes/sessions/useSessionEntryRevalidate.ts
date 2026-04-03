import { useEffect, useRef } from 'react'

type UseSessionEntryRevalidateOptions = {
    sessionId: string
    onRevalidate: () => void
}

export function useSessionEntryRevalidate(
    options: UseSessionEntryRevalidateOptions
): void {
    const lastRevalidatedSessionIdRef = useRef<string | null>(null)
    const { onRevalidate, sessionId } = options

    useEffect(() => {
        if (lastRevalidatedSessionIdRef.current === sessionId) {
            return
        }

        lastRevalidatedSessionIdRef.current = sessionId
        onRevalidate()
    }, [onRevalidate, sessionId])
}
