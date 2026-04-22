import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementHeight } from '@/hooks/useElementHeight'

type ResizeObserverCallback = ConstructorParameters<typeof ResizeObserver>[0]

let resizeObserverCallback: ResizeObserverCallback | null = null
let mockedHeight = 120

class ResizeObserverMock {
    constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback
    }

    observe(): void {}

    unobserve(): void {}

    disconnect(): void {}
}

function HeightProbe(): React.JSX.Element {
    const elementRef = useRef<HTMLDivElement | null>(null)
    const height = useElementHeight(elementRef)
    const renderCountRef = useRef(0)
    renderCountRef.current += 1

    return (
        <div>
            <div ref={elementRef} data-testid="target" />
            <output data-testid="height">{height}</output>
            <output data-testid="render-count">{renderCountRef.current}</output>
        </div>
    )
}

describe('useElementHeight', () => {
    beforeEach(() => {
        mockedHeight = 120
        resizeObserverCallback = null
        vi.stubGlobal('ResizeObserver', ResizeObserverMock as unknown as typeof ResizeObserver)
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if ((this as HTMLElement).dataset.testid === 'target') {
                return {
                    width: 0,
                    height: mockedHeight,
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: mockedHeight,
                    x: 0,
                    y: 0,
                    toJSON() {
                        return {}
                    },
                }
            }

            return {
                width: 0,
                height: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                x: 0,
                y: 0,
                toJSON() {
                    return {}
                },
            }
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('skips redundant updates when the measured height does not change', () => {
        render(<HeightProbe />)

        expect(screen.getByTestId('height').textContent).toBe('120')
        const renderCountAfterSync = Number(screen.getByTestId('render-count').textContent)

        act(() => {
            resizeObserverCallback?.([], {} as ResizeObserver)
        })

        expect(screen.getByTestId('height').textContent).toBe('120')
        expect(Number(screen.getByTestId('render-count').textContent)).toBe(renderCountAfterSync)
    })
})
