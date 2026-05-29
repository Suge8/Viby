import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { NewSessionChoiceField } from './NewSessionChoiceField'

afterEach(() => {
    cleanup()
})

function renderField(props: Parameters<typeof NewSessionChoiceField>[0]) {
    return render(
        <I18nProvider>
            <NewSessionChoiceField {...props} />
        </I18nProvider>
    )
}

describe('NewSessionChoiceField', () => {
    it('opens a modal dialog when the trigger is clicked', () => {
        renderField({
            ariaLabel: 'Agent',
            value: null,
            placeholder: 'Choose agent',
            options: [
                { value: 'codex', label: 'Codex' },
                { value: 'claude', label: 'Claude' },
            ],
            onChange: () => undefined,
        })

        expect(screen.queryByRole('group', { name: 'Agent' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
        expect(screen.getByRole('group', { name: 'Agent' })).toHaveClass('ds-new-session-choice-options')
    })

    it('supports arrow-key navigation inside the option list', () => {
        renderField({
            ariaLabel: 'Agent',
            value: null,
            placeholder: 'Choose agent',
            options: [
                { value: 'codex', label: 'Codex' },
                { value: 'claude', label: 'Claude' },
            ],
            onChange: () => undefined,
        })

        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
        const codex = screen.getByRole('button', { name: /Codex/ })
        const claude = screen.getByRole('button', { name: /Claude/ })

        codex.focus()
        fireEvent.keyDown(codex, { key: 'ArrowDown' })

        expect(claude).toHaveFocus()
    })

    it('shows a spinner on the trigger while loading', () => {
        renderField({
            ariaLabel: 'Model',
            value: 'auto',
            options: [{ value: 'auto', label: 'Terminal default model' }],
            isLoading: true,
            onChange: () => undefined,
        })

        const trigger = screen.getByRole('button', { name: 'Model' })
        expect(trigger).toHaveAttribute('aria-busy', 'true')
        expect(trigger).not.toHaveTextContent('Terminal default model')
    })

    it('hides the spinner once loading completes', () => {
        renderField({
            ariaLabel: 'Model',
            value: 'auto',
            options: [{ value: 'auto', label: 'Terminal default model' }],
            isLoading: false,
            onChange: () => undefined,
        })

        const trigger = screen.getByRole('button', { name: 'Model' })
        expect(trigger).not.toHaveAttribute('aria-busy', 'true')
        expect(trigger).toHaveTextContent('Terminal default model')
    })

    it('fires onChange and closes the dialog when an option is selected', () => {
        const onChange = vi.fn()
        renderField({
            ariaLabel: 'Agent',
            value: null,
            placeholder: 'Choose agent',
            options: [
                { value: 'codex', label: 'Codex' },
                { value: 'claude', label: 'Claude' },
            ],
            onChange,
        })

        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
        fireEvent.click(screen.getByRole('button', { name: /Codex/ }))

        expect(onChange).toHaveBeenCalledWith('codex')
        expect(screen.queryByRole('group', { name: 'Agent' })).not.toBeInTheDocument()
    })
})
