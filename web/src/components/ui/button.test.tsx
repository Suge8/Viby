import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

    it('keeps the shared pressed lifecycle when callers provide pointer handlers', () => {
        const onPointerDown = vi.fn()
        const onPointerUp = vi.fn()
        render(
            <Button pressStyle="card" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
                Session card with handlers
            </Button>
        )

        const button = screen.getByRole('button', { name: 'Session card with handlers' })

        fireEvent.pointerDown(button, { clientX: 20, clientY: 24, pointerType: 'touch' })
        expect(onPointerDown).toHaveBeenCalledTimes(1)
        expect(button).toHaveAttribute('data-pressed', 'true')

        fireEvent.pointerUp(button, { pointerType: 'touch' })
        expect(onPointerUp).toHaveBeenCalledTimes(1)
        expect(button).not.toHaveAttribute('data-pressed')
    })

    it('clears the pressed state on click fallback when navigation commits before pointer-up', () => {
        render(<Button pressStyle="card">Open session</Button>)

        const button = screen.getByRole('button', { name: 'Open session' })

        fireEvent.pointerDown(button, { clientX: 20, clientY: 24, pointerType: 'mouse' })
        expect(button).toHaveAttribute('data-pressed', 'true')

        fireEvent.click(button)
        expect(button).not.toHaveAttribute('data-pressed')
    })

    it('keeps shared button sizes fully rounded for a more tactile global button shape', () => {
        render(
            <>
                <Button>Default</Button>
                <Button size="sm">Small</Button>
                <Button size="lg">Large</Button>
            </>
        )

        expect(screen.getByRole('button', { name: 'Default' }).className).toContain('rounded-full')
        expect(screen.getByRole('button', { name: 'Small' }).className).toContain('rounded-full')
        expect(screen.getByRole('button', { name: 'Large' }).className).toContain('rounded-full')
    })

    it('keeps icon button sizes fully rounded', () => {
        render(
            <>
                <Button size="icon" aria-label="Icon" />
                <Button size="iconXs" aria-label="Icon extra small" />
                <Button size="iconSm" aria-label="Icon small" />
                <Button size="iconLg" aria-label="Icon large" />
            </>
        )

        expect(screen.getByRole('button', { name: 'Icon' }).className).toContain('rounded-full')
        expect(screen.getByRole('button', { name: 'Icon' }).className).toContain('min-h-0')
        expect(screen.getByRole('button', { name: 'Icon extra small' }).className).toContain('h-8')
        expect(screen.getByRole('button', { name: 'Icon extra small' }).className).toContain('min-h-0')
        expect(screen.getByRole('button', { name: 'Icon small' }).className).toContain('rounded-full')
        expect(screen.getByRole('button', { name: 'Icon small' }).className).toContain('min-h-0')
        expect(screen.getByRole('button', { name: 'Icon large' }).className).toContain('rounded-full')
        expect(screen.getByRole('button', { name: 'Icon large' }).className).toContain('min-h-0')
        expect(screen.getByRole('button', { name: 'Icon large' }).className).toContain('h-14')
    })
})
