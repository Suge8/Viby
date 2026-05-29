import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectingProgressRail } from './ConnectingProgressRail'

describe('ConnectingProgressRail', () => {
    it('exposes the current progress to assistive tech', () => {
        render(<ConnectingProgressRail progress={0.42} />)
        const rail = screen.getByRole('progressbar')

        expect(rail).toHaveAttribute('aria-valuenow', '42')
        expect(rail).toHaveAttribute('aria-valuemin', '0')
        expect(rail).toHaveAttribute('aria-valuemax', '100')
    })

    it('clamps out-of-range values into the [0, 1] bar fill', () => {
        const { rerender } = render(<ConnectingProgressRail progress={-0.5} />)
        let rail = screen.getByRole('progressbar')

        expect(rail).toHaveAttribute('aria-valuenow', '0')

        rerender(<ConnectingProgressRail progress={1.6} />)
        rail = screen.getByRole('progressbar')
        expect(rail).toHaveAttribute('aria-valuenow', '100')
    })

    it('keeps the rail free of trailing sheen decoration', () => {
        render(<ConnectingProgressRail progress={0.42} />)

        expect(document.querySelector('.ds-connecting-rail-sheen')).toBeNull()
    })
})
