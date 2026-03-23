import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'

describe('Button', () => {
    it('defaults button press interactions to pointer glow mode', () => {
        render(<Button>Send</Button>)

        const button = screen.getByRole('button', { name: 'Send' })

        expect(button).toHaveAttribute('data-button-press-style', 'button')
        expect(button).toHaveAttribute('data-button-pointer-effect', 'default')
    })

    it('uses the card press style to disable pointer glow and tracks pressed state', () => {
        render(<Button pressStyle="card">Session card</Button>)

        const button = screen.getByRole('button', { name: 'Session card' })

        expect(button).toHaveAttribute('data-button-press-style', 'card')
        expect(button).toHaveAttribute('data-button-pointer-effect', 'none')

        fireEvent.pointerDown(button, { clientX: 20, clientY: 24, pointerType: 'touch' })
        expect(button).toHaveAttribute('data-pressed', 'true')

        fireEvent.pointerUp(button, { pointerType: 'touch' })
        expect(button).not.toHaveAttribute('data-pressed')
    })
})
