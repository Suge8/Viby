import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderSessionList } from './SessionList.support'

describe('SessionList card shell', () => {
    it('renders session cards without the legacy border shell', () => {
        renderSessionList()

        const workingCard = screen.getByText('Bao summary').closest('button')

        expect(workingCard).not.toBeNull()
        expect(workingCard?.className).not.toMatch(/\bborder-\[/)
    })
})
