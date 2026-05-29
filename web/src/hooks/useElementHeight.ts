import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

function readElementHeight(element: HTMLElement | null): number {
    if (!element) {
        return 0
    }

    return Math.round(element.getBoundingClientRect().height)
}

export function useElementHeight(elementRef: RefObject<HTMLElement | null>): number {
    const [height, setHeight] = useState(0)
    const observedElementRef = useRef<HTMLElement | null>(null)
    const cleanupRef = useRef<(() => void) | null>(null)

    useLayoutEffect(() => {
        const element = elementRef.current
        if (observedElementRef.current === element) {
            return
        }

        cleanupRef.current?.()
        cleanupRef.current = null
        observedElementRef.current = element

        if (!element) {
            setHeight((previousHeight) => (previousHeight === 0 ? previousHeight : 0))
            return
        }

        function syncHeight(): void {
            const nextHeight = readElementHeight(element)
            setHeight((previousHeight) => (previousHeight === nextHeight ? previousHeight : nextHeight))
        }

        syncHeight()

        const resizeObserver = new ResizeObserver(syncHeight)
        resizeObserver.observe(element)
        window.addEventListener('resize', syncHeight)

        cleanupRef.current = () => {
            resizeObserver.disconnect()
            window.removeEventListener('resize', syncHeight)
        }
    })

    useLayoutEffect(() => {
        return () => {
            cleanupRef.current?.()
            cleanupRef.current = null
            observedElementRef.current = null
        }
    }, [])

    return height
}
