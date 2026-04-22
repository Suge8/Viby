import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalView } from './TerminalView'

const fitSpy = vi.fn()
const openSpy = vi.fn()
const loadAddonSpy = vi.fn()
const refreshSpy = vi.fn()
const resizeObserverState = vi.hoisted(() => ({
    callback: null as ResizeObserverCallback | null,
}))
const rafQueue = vi.hoisted(() => [] as FrameRequestCallback[])

vi.mock('@xterm/xterm/css/xterm.css', () => ({}))

vi.mock('@xterm/xterm', () => ({
    Terminal: class TerminalMock {
        cols = 80
        rows = 24
        options: Record<string, unknown> = {}

        constructor(options: Record<string, unknown>) {
            this.options = options
        }

        loadAddon(addon: unknown) {
            loadAddonSpy(addon)
        }

        open(element: HTMLElement) {
            openSpy(element)
        }

        refresh(start: number, end: number) {
            refreshSpy(start, end)
        }

        dispose() {}
    },
}))

vi.mock('@xterm/addon-fit', () => ({
    FitAddon: class FitAddonMock {
        fit() {
            fitSpy()
        }

        dispose() {}
    },
}))

vi.mock('@xterm/addon-web-links', () => ({
    WebLinksAddon: class WebLinksAddonMock {
        dispose() {}
    },
}))

vi.mock('@/lib/terminalFont', () => ({
    ensureBuiltinFontLoaded: vi.fn(async () => false),
    getFontProvider: () => ({
        getFontFamily: () => 'Mock Font',
    }),
}))

describe('TerminalView', () => {
    const OriginalResizeObserver = globalThis.ResizeObserver
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

    beforeEach(() => {
        fitSpy.mockReset()
        openSpy.mockReset()
        loadAddonSpy.mockReset()
        refreshSpy.mockReset()
        resizeObserverState.callback = null
        rafQueue.length = 0

        class ResizeObserverMock implements ResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeObserverState.callback = callback
            }

            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        }

        Object.defineProperty(globalThis, 'ResizeObserver', {
            configurable: true,
            writable: true,
            value: ResizeObserverMock as unknown as typeof ResizeObserver,
        })

        Object.defineProperty(globalThis, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn((callback: FrameRequestCallback) => {
                rafQueue.push(callback)
                return rafQueue.length
            }),
        })

        Object.defineProperty(globalThis, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: vi.fn((id: number) => {
                rafQueue[id - 1] = () => {}
            }),
        })
    })

    afterEach(() => {
        cleanup()
        if (OriginalResizeObserver) {
            Object.defineProperty(globalThis, 'ResizeObserver', {
                configurable: true,
                writable: true,
                value: OriginalResizeObserver,
            })
        } else {
            delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
        }
        Object.defineProperty(globalThis, 'requestAnimationFrame', {
            configurable: true,
            writable: true,
            value: originalRequestAnimationFrame,
        })
        Object.defineProperty(globalThis, 'cancelAnimationFrame', {
            configurable: true,
            writable: true,
            value: originalCancelAnimationFrame,
        })
    })

    it('coalesces repeated resize observer pulses into one fit per animation frame', async () => {
        const onResize = vi.fn()
        render(<TerminalView onResize={onResize} />)

        await waitFor(() => {
            expect(openSpy).toHaveBeenCalledTimes(1)
            expect(resizeObserverState.callback).not.toBeNull()
        })

        const container = openSpy.mock.calls[0]?.[0] as HTMLDivElement
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 320,
        })
        Object.defineProperty(container, 'clientHeight', {
            configurable: true,
            value: 200,
        })

        expect(fitSpy).toHaveBeenCalledTimes(0)
        expect(rafQueue).toHaveLength(1)

        rafQueue.shift()?.(16)
        expect(fitSpy).toHaveBeenCalledTimes(1)
        expect(onResize).toHaveBeenCalledTimes(1)

        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 640,
        })
        Object.defineProperty(container, 'clientHeight', {
            configurable: true,
            value: 240,
        })

        resizeObserverState.callback?.([], {} as ResizeObserver)
        resizeObserverState.callback?.([], {} as ResizeObserver)
        resizeObserverState.callback?.([], {} as ResizeObserver)

        expect(rafQueue).toHaveLength(1)

        rafQueue.shift()?.(32)
        expect(fitSpy).toHaveBeenCalledTimes(2)
        expect(onResize).toHaveBeenCalledTimes(2)
    })
})
