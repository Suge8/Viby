import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DisclosureCardSection } from '@/components/ui/DisclosureCardSection'

afterEach(() => {
    cleanup()
})

describe('DisclosureCardSection', () => {
    function getPanelState(text: string): string | null {
        return screen.getByText(text).closest('[data-state]')?.getAttribute('data-state') ?? null
    }

    it('toggles its panel in uncontrolled mode', () => {
        render(
            <DisclosureCardSection triggerContent={<span>Toggle</span>}>
                <div>Panel body</div>
            </DisclosureCardSection>
        )

        expect(getPanelState('Panel body')).toBe('closed')

        fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
        expect(getPanelState('Panel body')).toBe('open')

        fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
        expect(getPanelState('Panel body')).toBe('closed')
    })

    it('respects controlled open state and reports toggles outward', () => {
        const onOpenChange = vi.fn()

        const { rerender } = render(
            <DisclosureCardSection open={false} onOpenChange={onOpenChange} triggerContent={<span>Toggle</span>}>
                <div>Panel body</div>
            </DisclosureCardSection>
        )

        fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
        expect(onOpenChange).toHaveBeenCalledWith(true)
        expect(getPanelState('Panel body')).toBe('closed')

        rerender(
            <DisclosureCardSection open onOpenChange={onOpenChange} triggerContent={<span>Toggle</span>}>
                <div>Panel body</div>
            </DisclosureCardSection>
        )

        expect(getPanelState('Panel body')).toBe('open')
    })

    it('does not toggle while disabled', () => {
        const onOpenChange = vi.fn()

        render(
            <DisclosureCardSection disabled onOpenChange={onOpenChange} triggerContent={<span>Toggle</span>}>
                <div>Panel body</div>
            </DisclosureCardSection>
        )

        fireEvent.click(screen.getByRole('button', { name: /toggle/i }))
        expect(onOpenChange).not.toHaveBeenCalled()
        expect(getPanelState('Panel body')).toBe('closed')
    })

    it('keeps an explicit trigger radius instead of inheriting a square parent radius', () => {
        render(
            <DisclosureCardSection className="rounded-none" triggerContent={<span>Toggle</span>}>
                <div>Panel body</div>
            </DisclosureCardSection>
        )

        const trigger = screen.getByRole('button', { name: /toggle/i })
        expect(trigger).toHaveClass('rounded-2xl')
        expect(trigger).not.toHaveClass('ds-interactive-card-inherit-radius')
    })
})
