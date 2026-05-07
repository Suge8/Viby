import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewSessionChoiceField } from './NewSessionChoiceField'

function dispatchPointer(target: Element, type: string, init: Record<string, number>): void {
    const event = new Event(type, { bubbles: true })
    for (const [key, value] of Object.entries(init)) {
        Object.defineProperty(event, key, { value })
    }
    target.dispatchEvent(event)
}

describe('NewSessionChoiceField', () => {
    it('supports arrow-key navigation inside options', () => {
        render(
            <NewSessionChoiceField
                ariaLabel="Agent"
                value={null}
                placeholder="Choose agent"
                options={[
                    { value: 'codex', label: 'Codex' },
                    { value: 'claude', label: 'Claude' },
                ]}
                onChange={() => undefined}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
        const codex = screen.getByRole('button', { name: /Codex/ })
        const claude = screen.getByRole('button', { name: /Claude/ })

        codex.focus()
        fireEvent.keyDown(codex, { key: 'ArrowDown' })

        expect(claude).toHaveFocus()
    })

    it('keeps option list open during outside scroll drag and closes on outside tap', () => {
        const onChange = vi.fn()
        render(
            <NewSessionChoiceField
                ariaLabel="Agent"
                value={null}
                placeholder="Choose agent"
                options={[
                    { value: 'codex', label: 'Codex' },
                    { value: 'claude', label: 'Claude' },
                ]}
                onChange={onChange}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
        expect(screen.getByRole('group', { name: 'Agent' })).toHaveClass('ds-new-session-choice-options')

        dispatchPointer(document.body, 'pointerdown', { pointerId: 1, clientX: 8, clientY: 8 })
        dispatchPointer(document.body, 'pointerup', { pointerId: 1, clientX: 8, clientY: 40 })
        expect(screen.getByRole('group', { name: 'Agent' })).toBeInTheDocument()

        fireEvent.pointerDown(document.body)
        fireEvent.pointerUp(document.body)
        expect(screen.queryByRole('group', { name: 'Agent' })).not.toBeInTheDocument()
    })
})
