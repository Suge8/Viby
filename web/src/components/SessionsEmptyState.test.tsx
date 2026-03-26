import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithI18n } from '@/test/i18n'
import { SessionsEmptyState } from './SessionsEmptyState'

describe('SessionsEmptyState', () => {
    it('renders the idle empty state actions', async () => {
        const onCreate = vi.fn()
        const onOpenSettings = vi.fn()

        await renderWithI18n(
            <SessionsEmptyState
                hasSessions={false}
                onCreate={onCreate}
                onOpenSettings={onOpenSettings}
            />
        )

        expect(screen.getByText('Start your first Viby session')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'New Session' }))
        fireEvent.click(screen.getByRole('button', { name: 'Settings' }))

        expect(onCreate).toHaveBeenCalledTimes(1)
        expect(onOpenSettings).toHaveBeenCalledTimes(1)
    })

    it('renders the selection empty state copy when sessions already exist', async () => {
        await renderWithI18n(
            <SessionsEmptyState
                hasSessions
                onCreate={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        )

        expect(screen.getByText('Pick a session to keep going')).toBeInTheDocument()
        expect(screen.getByText('Choose any session from the left to reopen the conversation, inspect files, or jump back into the terminal.')).toBeInTheDocument()
    })
})
