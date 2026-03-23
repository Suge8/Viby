import { useLayoutEffect, useState, type RefObject } from 'react'

function readElementHeight(element: HTMLElement | null): number {
    if (!element) {
        return 0
    }

    return Math.round(element.getBoundingClientRect().height)
}

export function useElementHeight(elementRef: RefObject<HTMLElement | null>): number {
    const [height, setHeight] = useState(0)

    useLayoutEffect(() => {
        const element = elementRef.current
        if (!element) {
            setHeight(0)
            return
        }

        function syncHeight(): void {
            setHeight(readElementHeight(element))
        }

        syncHeight()

        const resizeObserver = new ResizeObserver(syncHeight)
        resizeObserver.observe(element)
        window.addEventListener('resize', syncHeight)

        return () => {
            resizeObserver.disconnect()
            window.removeEventListener('resize', syncHeight)
        }
    }, [elementRef])

    return height
}
