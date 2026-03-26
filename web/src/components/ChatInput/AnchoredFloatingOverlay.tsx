import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
    type RefObject
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
    gap?: number
}

type OverlayPosition = {
    top: number
    left: number
    width: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max)
}

export const AnchoredFloatingOverlay = memo(function AnchoredFloatingOverlay(
    props: AnchoredFloatingOverlayProps
): React.JSX.Element | null {
    const { anchorRef, children, className, maxHeight = 240, gap = DEFAULT_OVERLAY_GAP_PX } = props
    const overlayRef = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState<OverlayPosition | null>(null)

    const updatePosition = useCallback(() => {
        const anchorElement = anchorRef.current
        const overlayElement = overlayRef.current
        if (!anchorElement || !overlayElement) {
            return
        }

        const anchorRect = anchorElement.getBoundingClientRect()
        const overlayRect = overlayElement.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const width = Math.max(anchorRect.width, 0)
        const maxLeft = Math.max(VIEWPORT_PADDING_PX, viewportWidth - width - VIEWPORT_PADDING_PX)
        const left = clamp(anchorRect.left, VIEWPORT_PADDING_PX, maxLeft)
        const spaceAbove = anchorRect.top - gap - VIEWPORT_PADDING_PX
        const spaceBelow = viewportHeight - anchorRect.bottom - gap - VIEWPORT_PADDING_PX
        const openAbove = spaceAbove >= overlayRect.height || spaceAbove >= spaceBelow
        const preferredTop = openAbove
            ? anchorRect.top - overlayRect.height - gap
            : anchorRect.bottom + gap
        const maxTop = Math.max(VIEWPORT_PADDING_PX, viewportHeight - overlayRect.height - VIEWPORT_PADDING_PX)

        setPosition({
            top: clamp(preferredTop, VIEWPORT_PADDING_PX, maxTop),
            left,
            width
        })
    }, [anchorRef, gap])

    useLayoutEffect(() => {
        updatePosition()
    }, [children, updatePosition])

    useEffect(() => {
        const anchorElement = anchorRef.current
        const overlayElement = overlayRef.current
        if (!anchorElement || !overlayElement) {
            return
        }

        const handleReflow = () => {
            updatePosition()
        }

        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)

        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver(handleReflow)
        resizeObserver?.observe(anchorElement)
        resizeObserver?.observe(overlayElement)

        return () => {
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
            resizeObserver?.disconnect()
        }
    }, [anchorRef, updatePosition])

    if (typeof document === 'undefined') {
        return null
    }

    const style: CSSProperties | undefined = position
        ? {
            top: position.top,
            left: position.left,
            width: position.width
        }
        : {
            visibility: 'hidden'
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
                maxHeight={maxHeight}
            >
                {children}
            </FloatingOverlay>
        </div>,
        document.body
    )
})
