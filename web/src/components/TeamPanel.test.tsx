import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TeamPanel } from './TeamPanel'

describe('TeamPanel', () => {
    it('uses the shared collapsible owner for team details', () => {
        render(
            <TeamPanel
                teamState={{
                    teamName: 'Launch Ops',
                    description: 'Coordinate launch readiness.',
                    members: [
                        { name: 'Alice', status: 'active', agentType: 'planner' },
                        { name: 'Bob', status: 'shutdown', agentType: 'worker' }
                    ],
                    tasks: [
                        { id: 'task-1', title: 'Warm cache', status: 'completed', owner: 'Alice' },
                        { id: 'task-2', title: 'Smoke check', status: 'in_progress', owner: 'Bob' }
                    ],
                    messages: [
                        { from: 'Alice', to: 'Bob', summary: 'Preload completed.', type: 'message', timestamp: 1 },
                        { from: 'Bob', to: 'Alice', summary: 'Running smoke.', type: 'message', timestamp: 2 }
                    ]
                }}
            />
        )

        const toggle = screen.getByRole('button', {
            name: /Team: Launch Ops/i
        })
        const details = screen.getByTestId('team-panel-details')

        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        expect(details).toHaveAttribute('data-state', 'closed')
        expect(details).toHaveAttribute('aria-hidden', 'true')

        fireEvent.click(toggle)

        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        expect(details).toHaveAttribute('data-state', 'open')
        expect(details).toHaveAttribute('aria-hidden', 'false')
        expect(screen.getByText('Coordinate launch readiness.')).toBeVisible()
        expect(screen.getByText('Members')).toBeVisible()
        expect(screen.getByText('Warm cache')).toBeVisible()
        expect(screen.getByText('Preload completed.')).toBeVisible()
    })
})
