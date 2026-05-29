import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionButtons } from './ActionButtons'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => (key === 'button.cancel' ? 'Cancel' : key === 'newSession.creating' ? 'Creating…' : key),
    }),
}))

describe('ActionButtons', () => {
    it('disables create while pending even when the last readiness snapshot was createable', () => {
        const onCreate = vi.fn()
        render(<ActionButtons canCreate isPending isDisabled={false} onCancel={vi.fn()} onCreate={onCreate} />)

        const button = screen.getByRole('button', { name: /Creating/ })
        expect(button).toBeDisabled()
        fireEvent.click(button)
        expect(onCreate).not.toHaveBeenCalled()
    })
})
