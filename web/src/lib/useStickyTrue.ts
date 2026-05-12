import { useEffect, useState } from 'react'

export function useStickyTrue(value: boolean, minTrueMs: number): boolean {
    const [sticky, setSticky] = useState(value)

    useEffect(() => {
        if (value) {
            setSticky(true)
            return
        }
        const timer = window.setTimeout(() => {
            setSticky(false)
        }, minTrueMs)
        return () => {
            window.clearTimeout(timer)
        }
    }, [minTrueMs, value])

    return sticky
}
