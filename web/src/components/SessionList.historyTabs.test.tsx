import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    TEST_BAO_PROJECT_PATH,
    TEST_HISTORY_PROJECT_PATH,
    TEST_OPEN_PROJECT_PATH,
    TEST_PROJECT_PATH,
} from '@/test/sessionFactories'
import {
    createSessionSummary,
    I18nProviderComponent as I18nProvider,
    renderSessionList,
    SessionListComponent as SessionList,
} from './SessionList.support'

describe('SessionList history tabs', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        window.localStorage.clear()
        document.body.innerHTML = ''
    })

    it('uses the top tabs as the only running/history filter owner', () => {
        renderSessionList()
        expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
        expect(screen.getAllByText('History').length).toBeGreaterThan(0)
        expect(screen.getByText('Working')).toBeInTheDocument()
        expect(screen.queryByText('History only')).not.toBeInTheDocument()
        expect(screen.queryByText('GPT-5.4 Mini')).not.toBeInTheDocument()
        expect(screen.queryByText('High')).not.toBeInTheDocument()
        expect(screen.queryByText(/model:/i)).not.toBeInTheDocument()
        expect(screen.getByText('Bao summary')).toBeInTheDocument()
        expect(screen.queryByText('Archived summary')).not.toBeInTheDocument()
        expect(screen.queryByTitle('Reply')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('tab', { name: /History/ }))
        expect(screen.getAllByText('History only').length).toBeGreaterThan(0)
        expect(screen.getByText('Archived summary')).toBeInTheDocument()
        expect(screen.queryByText('Bao summary')).not.toBeInTheDocument()
    })

    it('keeps explicitly open sessions in the Active tab after abort detaches the runtime', () => {
        const now = Date.now()

        renderSessionList({
            sessions: [
                createSessionSummary({
                    id: 'session-open',
                    active: false,
                    thinking: false,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now,
                    lifecycleState: 'open',
                    lifecycleStateSince: now,
                    resumeAvailable: true,
                    metadata: {
                        path: TEST_OPEN_PROJECT_PATH,
                        driver: 'codex',
                        summary: { text: 'Open summary', updatedAt: now },
                    },
                }),
                createSessionSummary({
                    id: 'session-history',
                    lifecycleState: 'closed',
                    lifecycleStateSince: now - 1_000,
                    updatedAt: now - 1_000,
                    latestActivityAt: now - 1_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1_000,
                    metadata: {
                        path: TEST_HISTORY_PROJECT_PATH,
                        driver: 'claude',
                        summary: { text: 'History summary', updatedAt: now - 1_000 },
                    },
                }),
            ],
        })

        expect(screen.getByText('Open summary')).toBeInTheDocument()
        expect(screen.queryByText('History summary')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: /History/ }))

        expect(screen.getByText('History summary')).toBeInTheDocument()
        expect(screen.queryByText('Open summary')).not.toBeInTheDocument()
    })

    it('switches to the history tab when the selected session becomes archived later', () => {
        const now = Date.now()
        const { rerender } = renderSessionList({
            selectedSessionId: 'session-2',
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    active: true,
                    thinking: true,
                    activeAt: now,
                    updatedAt: now,
                    latestActivityAt: now,
                    latestActivityKind: 'reply',
                    latestCompletedReplyAt: null,
                    lifecycleState: 'running',
                    lifecycleStateSince: now,
                    metadata: {
                        path: TEST_BAO_PROJECT_PATH,
                        driver: 'codex',
                        summary: { text: 'Bao summary', updatedAt: now },
                    },
                }),
                createSessionSummary({
                    id: 'session-2',
                    lifecycleState: 'closed',
                    lifecycleStateSince: now - 1000,
                    updatedAt: now - 1000,
                    latestActivityAt: now - 1000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 1000,
                    metadata: {
                        path: TEST_PROJECT_PATH,
                        driver: 'claude',
                        summary: { text: 'Needs review', updatedAt: now - 1000 },
                    },
                }),
                createSessionSummary({
                    id: 'session-3',
                    lifecycleState: 'archived',
                    lifecycleStateSince: now - 2000,
                    updatedAt: now - 2000,
                    latestActivityAt: now - 2000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: now - 2000,
                    metadata: {
                        path: TEST_PROJECT_PATH,
                        driver: 'claude',
                        summary: { text: 'Archived summary', updatedAt: now - 2000 },
                    },
                }),
            ],
        })

        rerender(
            <I18nProvider>
                <SessionList
                    sessions={[
                        createSessionSummary({
                            id: 'session-1',
                            active: true,
                            thinking: true,
                            activeAt: now,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'reply',
                            latestCompletedReplyAt: null,
                            lifecycleState: 'running',
                            lifecycleStateSince: now,
                            metadata: {
                                path: TEST_BAO_PROJECT_PATH,
                                driver: 'codex',
                                summary: { text: 'Bao summary', updatedAt: now },
                            },
                        }),
                        createSessionSummary({
                            id: 'session-2',
                            lifecycleState: 'archived',
                            lifecycleStateSince: now,
                            updatedAt: now,
                            latestActivityAt: now,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now,
                            metadata: {
                                path: TEST_PROJECT_PATH,
                                driver: 'claude',
                                summary: { text: 'Needs review', updatedAt: now },
                            },
                        }),
                        createSessionSummary({
                            id: 'session-3',
                            lifecycleState: 'archived',
                            lifecycleStateSince: now - 2000,
                            updatedAt: now - 2000,
                            latestActivityAt: now - 2000,
                            latestActivityKind: 'ready',
                            latestCompletedReplyAt: now - 2000,
                            metadata: {
                                path: TEST_PROJECT_PATH,
                                driver: 'claude',
                                summary: { text: 'Archived summary', updatedAt: now - 2000 },
                            },
                        }),
                    ]}
                    api={null}
                    selectedSessionId="session-2"
                    actions={{
                        onSelect: vi.fn(),
                        onNewSession: vi.fn(),
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Archived summary')).toBeInTheDocument()
        expect(screen.queryByText('Bao summary')).not.toBeInTheDocument()
    })
})
