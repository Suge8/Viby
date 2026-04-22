import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { type JSX, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnchoredFloatingOverlay } from '@/components/ChatInput/AnchoredFloatingOverlay'

const resizeObserverState = vi.hoisted(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}))

const anchorRect = {
    x: 40,
    y: 360,
    top: 360,
    left: 40,
    right: 360,
    bottom: 424,
    width: 320,
    height: 64,
    toJSON: () => ({}),
} as DOMRect

const overlayRect = {
    x: 40,
    y: 160,
    top: 160,
    left: 40,
    right: 320,
    bottom: 352,
    width: 280,
    height: 192,
    toJSON: () => ({}),
} as DOMRect

function Harness(): JSX.Element {
    const anchorRef = useRef<HTMLDivElement | null>(null)

    return (
        <div data-testid="shell" style={{ contain: 'paint' }}>
            <div ref={anchorRef} data-anchor="true" />
            <AnchoredFloatingOverlay anchorRef={anchorRef}>
                <div>overlay-body</div>
            </AnchoredFloatingOverlay>
        </div>
    )
}

function KeyboardHarness(props: { visibleViewportBottomPx?: number }): JSX.Element {
    const anchorRef = useRef<HTMLDivElement | null>(null)

    return (
        <div data-testid="shell-keyboard" style={{ contain: 'paint' }}>
            <div ref={anchorRef} data-anchor="true" />
            <AnchoredFloatingOverlay anchorRef={anchorRef} visibleViewportBottomPx={props.visibleViewportBottomPx}>
                <div>keyboard-overlay</div>
            </AnchoredFloatingOverlay>
        </div>
    )
}

function MinWidthHarness(props: { minWidth: number }): JSX.Element {
    const anchorRef = useRef<HTMLDivElement | null>(null)

    return (
        <div data-testid="shell-min-width" style={{ contain: 'paint' }}>
            <div ref={anchorRef} data-anchor="true" />
            <AnchoredFloatingOverlay anchorRef={anchorRef} minWidth={props.minWidth}>
                <div>min-width-overlay</div>
            </AnchoredFloatingOverlay>
        </div>
    )
}

describe('AnchoredFloatingOverlay', () => {
    const OriginalResizeObserver = globalThis.ResizeObserver
    const originalInnerHeight = window.innerHeight

    beforeEach(() => {
        resizeObserverState.observe.mockReset()
        resizeObserverState.unobserve.mockReset()
        resizeObserverState.disconnect.mockReset()

        class ResizeObserverMock implements ResizeObserver {
            constructor(_callback: ResizeObserverCallback) {}

            observe(target: Element): void {
                resizeObserverState.observe(target)
            }

            unobserve(target: Element): void {
                resizeObserverState.unobserve(target)
            }

            disconnect(): void {
                resizeObserverState.disconnect()
            }
        }

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            writable: true,
            value: ResizeObserverMock as unknown as typeof ResizeObserver,
        })

        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(
            this: HTMLElement
        ) {
            const element = this
            if (element.dataset.anchor === 'true') {
                return anchorRect
            }
            if (element.dataset.anchoredFloatingOverlay === 'true') {
                return overlayRect
            }
            return {
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: 0,
                height: 0,
                toJSON: () => ({}),
            } as DOMRect
        })
    })

    afterEach(() => {
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: originalInnerHeight,
        })
        if (OriginalResizeObserver) {
            Object.defineProperty(globalThis, 'ResizeObserver', {
                configurable: true,
                writable: true,
                value: OriginalResizeObserver,
            })
        } else {
            delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
        }
        vi.restoreAllMocks()
        cleanup()
    })

    it('renders the floating content in a body portal outside the contained anchor shell', async () => {
        render(<Harness />)

        const anchor = document.querySelector('[data-anchor="true"]') as HTMLElement

        await waitFor(() => {
            const overlay = document.querySelector('[data-anchored-floating-overlay="true"]') as HTMLElement | null
            expect(overlay).not.toBeNull()
            expect(overlay?.style.top).toBe('160px')
            expect(overlay?.style.left).toBe('40px')
            expect(overlay?.style.width).toBe('320px')
        })

        const overlayContent = screen.getByText('overlay-body')
        expect(document.body.contains(overlayContent)).toBe(true)
        expect(anchor.contains(overlayContent)).toBe(false)
        expect(resizeObserverState.observe).toHaveBeenCalledTimes(2)
    })

    it('keeps the floating panel visible when the mobile viewport is already reduced by the keyboard', async () => {
        Object.defineProperty(window, 'innerHeight', {
            configurable: true,
            value: 544,
        })

        render(<KeyboardHarness visibleViewportBottomPx={544} />)

        await waitFor(() => {
            const overlay = document.querySelector('[data-anchored-floating-overlay="true"]') as HTMLElement | null
            expect(overlay).not.toBeNull()
            expect(overlay?.style.top).toBe('160px')
            expect(overlay?.style.maxHeight).toBe('240px')
        })
    })

    it('repositions when the viewport owner publishes a smaller visible boundary', async () => {
        const { rerender } = render(<KeyboardHarness visibleViewportBottomPx={520} />)

        await waitFor(() => {
            const overlay = document.querySelector('[data-anchored-floating-overlay="true"]') as HTMLElement | null
            expect(overlay?.style.top).toBe('160px')
            expect(overlay?.style.maxHeight).toBe('240px')
        })

        rerender(<KeyboardHarness visibleViewportBottomPx={340} />)
        act(() => {
            window.dispatchEvent(new Event('resize'))
        })

        await waitFor(() => {
            const overlay = document.querySelector('[data-anchored-floating-overlay="true"]') as HTMLElement | null
            expect(overlay?.style.top).toBe('140px')
            expect(overlay?.style.maxHeight).toBe('240px')
        })
    })

    it('can widen a popover beyond the anchor width for compact trigger anchors', async () => {
        render(<MinWidthHarness minWidth={336} />)

        await waitFor(() => {
            const overlay = document.querySelector('[data-anchored-floating-overlay="true"]') as HTMLElement | null
            expect(overlay).not.toBeNull()
            expect(overlay?.style.width).toBe('336px')
            expect(overlay?.style.left).toBe('40px')
        })
    })
})
