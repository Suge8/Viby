import { type RefObject, useLayoutEffect, useState } from 'react'

export type ElementFrame = {
    left: number
    top: number
    width: number
    height: number
}

function readElementFrame(element: HTMLElement | null): ElementFrame | null {
    if (!element) {
        return null
    }

    const rect = element.getBoundingClientRect()
    return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
    }
}

function areElementFramesEqual(previousFrame: ElementFrame | null, nextFrame: ElementFrame | null): boolean {
    if (!previousFrame || !nextFrame) {
        return previousFrame === nextFrame
    }

    return (
        previousFrame.left === nextFrame.left &&
        previousFrame.top === nextFrame.top &&
        previousFrame.width === nextFrame.width &&
        previousFrame.height === nextFrame.height
    )
}

export function useElementFrame(elementRef: RefObject<HTMLElement | null>): ElementFrame | null {
    const [frame, setFrame] = useState<ElementFrame | null>(null)

    useLayoutEffect(() => {
        const element = elementRef.current
        if (!element) {
            setFrame(null)
            return
        }

        let animationFrameId = 0

        function syncFrame(): void {
            const nextFrame = readElementFrame(element)
            setFrame((currentFrame) => (areElementFramesEqual(currentFrame, nextFrame) ? currentFrame : nextFrame))
        }

        function scheduleFrameSync(): void {
            if (animationFrameId !== 0) {
                return
            }

            animationFrameId = window.requestAnimationFrame(() => {
                animationFrameId = 0
                syncFrame()
            })
        }

        syncFrame()

        const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFrameSync)
        resizeObserver?.observe(element)
        window.addEventListener('resize', scheduleFrameSync)
        window.addEventListener('scroll', scheduleFrameSync, true)
        window.visualViewport?.addEventListener('resize', scheduleFrameSync)
        window.visualViewport?.addEventListener('scroll', scheduleFrameSync)

        return () => {
            if (animationFrameId !== 0) {
                window.cancelAnimationFrame(animationFrameId)
            }
            resizeObserver?.disconnect()
            window.removeEventListener('resize', scheduleFrameSync)
            window.removeEventListener('scroll', scheduleFrameSync, true)
            window.visualViewport?.removeEventListener('resize', scheduleFrameSync)
            window.visualViewport?.removeEventListener('scroll', scheduleFrameSync)
        }
    }, [elementRef])

    return frame
}
