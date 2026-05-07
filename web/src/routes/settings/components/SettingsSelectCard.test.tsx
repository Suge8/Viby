import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsSelectCard } from './SettingsSelectCard'

describe('SettingsSelectCard', () => {
    it('delegates outer card chrome to the parent group while keeping option row geometry', () => {
        const onToggle = vi.fn()
        const onSelect = vi.fn()
        const { container } = render(
            <SettingsSelectCard
                summary={{
                    title: 'Appearance',
                    valueLabel: 'Follow System',
                }}
                disclosure={{
                    isOpen: true,
                    onToggle,
                }}
                selection={{
                    options: [
                        { value: 'system', label: 'Follow System' },
                        { value: 'light', label: 'Light' },
                    ],
                    selectedValue: 'system',
                    onSelect,
                }}
            />
        )

        const card = container.querySelector('section')
        expect(card).toHaveClass('ds-settings-select-card')
        expect(card?.className).not.toMatch(/rounded-/)
        expect(card?.className).not.toMatch(/\bmx-/)
        expect(card?.className).not.toMatch(/\bmy-/)

        const optionButton = screen.getByRole('button', { name: 'Light' })
        expect(optionButton).toHaveClass('rounded-[calc(var(--ds-radius-md)+2px)]')
    })

    it('keeps the disclosure behavior intact', () => {
        const onToggle = vi.fn()
        const onSelect = vi.fn()

        const { container } = render(
            <SettingsSelectCard
                summary={{
                    title: 'Appearance',
                    valueLabel: 'Follow System',
                }}
                disclosure={{
                    isOpen: false,
                    onToggle,
                }}
                selection={{
                    options: [
                        { value: 'system', label: 'Follow System' },
                        { value: 'light', label: 'Light' },
                    ],
                    selectedValue: 'system',
                    onSelect,
                }}
            />
        )

        const summaryButton = container.querySelector('section > button')
        expect(summaryButton).not.toBeNull()

        fireEvent.click(summaryButton as HTMLButtonElement)
        expect(onToggle).toHaveBeenCalledTimes(1)
    })
})
