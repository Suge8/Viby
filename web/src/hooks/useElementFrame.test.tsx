import { act, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementFrame } from '@/hooks/useElementFrame'

function FrameProbe(): React.JSX.Element {
    const [version, setVersion] = useState(0)
    const elementRef = useRef<HTMLDivElement | null>(null)
    const frame = useElementFrame(elementRef)

    return (
        <div>
            <button type="button" onClick={() => setVersion(1)}>
                switch
            </button>
            {version === 0 ? (
                <div key="first" ref={elementRef} data-testid="target" />
            ) : (
                <div key="second" ref={elementRef} data-testid="target-next" />
            )}
            <output data-testid="frame">
                {frame ? `${frame.left},${frame.top},${frame.width},${frame.height}` : 'none'}
            </output>
        </div>
    )
}

describe('useElementFrame', () => {
    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.dataset.testid === 'target') {
                return {
                    width: 300,
                    height: 40,
                    top: 20,
                    left: 10,
                    right: 310,
                    bottom: 60,
                    x: 10,
                    y: 20,
                    toJSON() {
                        return {}
                    },
                }
            }

            if (this.dataset.testid === 'target-next') {
                return {
                    width: 240,
                    height: 50,
                    top: 30,
                    left: 500,
                    right: 740,
                    bottom: 80,
                    x: 500,
                    y: 30,
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

    it('re-observes when a stable ref points at a remounted element', () => {
        render(<FrameProbe />)

        expect(screen.getByTestId('frame').textContent).toBe('10,20,300,40')

        act(() => {
            screen.getByRole('button', { name: 'switch' }).click()
        })

        expect(screen.getByTestId('frame').textContent).toBe('500,30,240,50')
    })
})
