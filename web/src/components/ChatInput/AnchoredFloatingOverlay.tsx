import {
    type CSSProperties,
    memo,
    type ReactNode,
    type RefObject,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { createPortal } from 'react-dom'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { cn } from '@/lib/utils'

const VIEWPORT_PADDING_PX = 8
const DEFAULT_OVERLAY_GAP_PX = 8

type AnchoredFloatingOverlayProps = {
    anchorRef: RefObject<HTMLElement | null>
    children: ReactNode
    className?: string
    maxHeight?: number
    minWidth?: number
    gap?: number
    visibleViewportBottomPx?: number
}

type OverlayPosition = {
    top: number
    left: number
    width: number
    maxHeight: number
}

function isSamePosition(a: OverlayPosition | null, b: OverlayPosition | null): boolean {
    if (a === b) {
        return true
    }
    if (!a || !b) {
        return false
    }

    return a.top === b.top && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

export const AnchoredFloatingOverlay = memo(function AnchoredFloatingOverlay(
    props: AnchoredFloatingOverlayProps
): React.JSX.Element | null {
    const {
        anchorRef,
        children,
        className,
        maxHeight = 240,
        minWidth = 0,
        gap = DEFAULT_OVERLAY_GAP_PX,
        visibleViewportBottomPx,
    } = props
    const overlayRef = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState<OverlayPosition | null>(null)
    const positionRef = useRef<OverlayPosition | null>(null)
    const frameRef = useRef<number | null>(null)

    const updatePosition = useCallback(() => {
        const anchorElement = anchorRef.current
        const overlayElement = overlayRef.current
        if (!anchorElement || !overlayElement) {
            return
        }

        const anchorRect = anchorElement.getBoundingClientRect()
        const overlayRect = overlayElement.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const visibleViewportBottom = Math.max(
            VIEWPORT_PADDING_PX,
            (visibleViewportBottomPx ?? window.innerHeight) - VIEWPORT_PADDING_PX
        )
        const maxWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING_PX * 2)
        const width = clamp(Math.max(anchorRect.width, minWidth), 0, maxWidth)
        const maxLeft = Math.max(VIEWPORT_PADDING_PX, viewportWidth - width - VIEWPORT_PADDING_PX)
        const left = clamp(anchorRect.left, VIEWPORT_PADDING_PX, maxLeft)
        const spaceAbove = anchorRect.top - gap - VIEWPORT_PADDING_PX
        const spaceBelow = visibleViewportBottom - anchorRect.bottom - gap
        const openAbove = spaceAbove >= overlayRect.height || spaceAbove >= spaceBelow
        const availableSpace = openAbove ? Math.max(spaceAbove, 0) : Math.max(spaceBelow, 0)
        const constrainedMaxHeight = Math.max(
            0,
            Math.min(maxHeight, availableSpace, Math.max(visibleViewportBottom - VIEWPORT_PADDING_PX * 2, 0))
        )
        const effectiveOverlayHeight =
            constrainedMaxHeight > 0 ? Math.min(overlayRect.height, constrainedMaxHeight) : overlayRect.height
        const preferredTop = openAbove ? anchorRect.top - effectiveOverlayHeight - gap : anchorRect.bottom + gap
        const maxTop = Math.max(VIEWPORT_PADDING_PX, visibleViewportBottom - effectiveOverlayHeight)

        const nextPosition = {
            top: clamp(preferredTop, VIEWPORT_PADDING_PX, maxTop),
            left,
            width,
            maxHeight: constrainedMaxHeight,
        }

        if (isSamePosition(positionRef.current, nextPosition)) {
            return
        }

        positionRef.current = nextPosition
        setPosition(nextPosition)
    }, [anchorRef, gap, maxHeight, minWidth, visibleViewportBottomPx])

    const schedulePositionUpdate = useCallback(() => {
        if (frameRef.current !== null) {
            return
        }

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            updatePosition()
        })
    }, [updatePosition])

    useLayoutEffect(() => {
        schedulePositionUpdate()
    }, [children, maxHeight, schedulePositionUpdate, visibleViewportBottomPx])

    useEffect(() => {
        const anchorElement = anchorRef.current
        const overlayElement = overlayRef.current
        if (!anchorElement || !overlayElement) {
            return
        }

        const handleReflow = () => {
            schedulePositionUpdate()
        }

        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)
        const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleReflow)
        resizeObserver?.observe(anchorElement)
        resizeObserver?.observe(overlayElement)

        return () => {
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
            resizeObserver?.disconnect()
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [anchorRef, schedulePositionUpdate])

    if (typeof document === 'undefined') {
        return null
    }

    const style: CSSProperties | undefined = position
        ? {
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
          }
        : {
              visibility: 'hidden',
          }

    return createPortal(
        <div
            ref={overlayRef}
            data-anchored-floating-overlay="true"
            className="pointer-events-none fixed z-40"
            style={style}
        >
            <FloatingOverlay
                className={cn('pointer-events-auto w-full', className)}
                maxHeight={position?.maxHeight ?? maxHeight}
            >
                {children}
            </FloatingOverlay>
        </div>,
        document.body
    )
})
