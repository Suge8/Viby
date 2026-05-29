import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSessionSummary, renderSessionList } from './SessionList.support'

describe('SessionList', () => {
    afterEach(() => {
        cleanup()
    })

    it('renders running sessions from authoritative summaries', () => {
        const now = Date.now()
        renderSessionList({
            sessions: [
                createSessionSummary({
                    id: 'running-1',
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'reply',
                    active: true,
                    activeAt: now,
                    metadata: {
                        path: '/tmp/running',
                        driver: 'codex',
                    },
                }),
                createSessionSummary({
                    id: 'history-1',
                    lifecycleState: 'closed',
                    lifecycleStateSince: now - 1_000,
                    updatedAt: now - 1_000,
                    latestActivityAt: now - 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1_000,
                    metadata: {
                        path: '/tmp/history',
                        driver: 'claude',
                    },
                }),
            ],
        })

        expect(screen.getByText('tmp/running')).toBeInTheDocument()
    })

    it('renders session rows as shared list items', () => {
        const now = Date.now()
        renderSessionList({
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'reply',
                    active: true,
                    activeAt: now,
                    metadata: {
                        path: '/tmp/project',
                        driver: 'codex',
                    },
                }),
            ],
        })

        expect(screen.getByTestId('session-list-item')).toBeInTheDocument()
    })

    it('does not let row-local promise pending own session opening state', () => {
        const never = new Promise<never>(() => {})
        const onSelect = vi.fn(() => never) as unknown as (sessionId: string) => void
        renderSessionList({ onSelect })

        const card = screen.getByTestId('session-list-item')
        fireEvent.click(card)

        expect(onSelect).toHaveBeenCalledWith('session-1')
        expect(card).not.toBeDisabled()
    })
})
