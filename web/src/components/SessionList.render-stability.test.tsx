import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ButtonHTMLAttributes } from 'react'
import type { SessionSummary } from '@/types/api'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionList } from './SessionList'

const rowRenderCounts = new Map<string, number>()

vi.mock('@/components/ui/button', () => ({
    Button: ({
        children,
        ...props
    }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>
}))

vi.mock('@/components/session-list/SessionListItem', () => ({
    SessionListItem: ({ session }: { session: SessionSummary }) => {
        rowRenderCounts.set(session.id, (rowRenderCounts.get(session.id) ?? 0) + 1)
        return <div data-testid={`session-row-${session.id}`}>{session.id}</div>
    }
}))

function createSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const { id, ...rest } = overrides

    return {
        active: true,
        thinking: false,
        activeAt: 1_000,
        updatedAt: 1_000,
        latestActivityAt: 1_000,
        latestActivityKind: 'reply',
        latestCompletedReplyAt: null,
        lifecycleState: 'running',
        lifecycleStateSince: 1_000,
        metadata: {
            path: '/tmp/project',
            driver: 'claude',
            summary: {
                text: 'Streaming title',
                updatedAt: 1_000
            }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        model: 'sonnet',
        modelReasoningEffort: null,
        ...rest,
        id
    }
}

describe('SessionList render stability', () => {
    beforeEach(() => {
        rowRenderCounts.clear()
    })

    afterEach(() => {
        rowRenderCounts.clear()
    })

    it('does not rerender a row when only chunk-level activity timestamps change', () => {
        const actions = {
            onSelect: vi.fn(),
            onNewSession: vi.fn()
        }
        const session = createSessionSummary({
            id: 'session-streaming',
            latestActivityAt: 2_000,
            latestActivityKind: 'reply',
            latestCompletedReplyAt: null,
            updatedAt: 1_000
        })

        const view = render(
            <I18nProvider>
                <SessionList
                    sessions={[session]}
                    api={null}
                    selectedSessionId={null}
                    actions={actions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-streaming')).toBe(1)

        view.rerender(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-streaming',
                            latestActivityAt: 3_000,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            updatedAt: 1_000
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={actions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-streaming')).toBe(1)
    })

    it('rerenders a row once the final ready state changes visible list state', () => {
        const initialActions = {
            onSelect: vi.fn(),
            onNewSession: vi.fn()
        }

        const view = render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-streaming',
                            latestActivityAt: 2_000,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            updatedAt: 1_000
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={initialActions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-streaming')).toBe(1)

        view.rerender(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-streaming',
                            latestActivityAt: 3_000,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: 3_000,
                            updatedAt: 3_000
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={initialActions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-streaming')).toBe(2)
    })

    it('rerenders a running row when its stable layout timestamp changes', () => {
        const actions = {
            onSelect: vi.fn(),
            onNewSession: vi.fn()
        }

        const view = render(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-running',
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: 1_000,
                            lifecycleStateSince: 1_000,
                            updatedAt: 1_000
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={actions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-running')).toBe(1)

        view.rerender(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-running',
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: 1_000,
                            lifecycleStateSince: 2_000,
                            updatedAt: 1_000
                        })
                    ]}
                    api={null}
                    selectedSessionId={null}
                    actions={actions}
                />
            </I18nProvider>
        )

        expect(rowRenderCounts.get('session-running')).toBe(2)
    })
})
