import { type RenderResult, render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { createTestSessionListSummary, TEST_BAO_PROJECT_PATH, TEST_PROJECT_PATH } from '@/test/sessionFactories'
import type { SessionSummary } from '@/types/api'

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation(() => ({
            matches: false,
            media: '(min-width: 1024px)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

vi.mock('@/hooks/useLongPress', () => ({
    useLongPress: ({ onClick }: { onClick: () => void }) => ({
        onClick,
        onPointerCancel: vi.fn(),
        onPointerDown: vi.fn(),
        onPointerLeave: vi.fn(),
        onPointerMove: vi.fn(),
        onPointerUp: vi.fn(),
        onContextMenu: vi.fn(),
    }),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
    }),
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        stopSession: vi.fn(),
        renameSession: vi.fn(),
        deleteSession: vi.fn(),
        isPending: false,
    }),
}))

vi.mock('@/components/SessionActionMenu', () => ({
    SessionActionMenu: () => null,
}))

vi.mock('@/components/RenameSessionDialog', () => ({
    RenameSessionDialog: () => null,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
    ConfirmDialog: () => null,
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string | number>) => {
            switch (key) {
                case 'sessions.section.running':
                    return 'Active'
                case 'sessions.section.history':
                    return 'History'
                case 'sessions.group.team':
                    return 'Team'
                case 'sessions.group.project.active':
                    return 'Project active'
                case 'sessions.group.project.delivered':
                    return 'Project delivered'
                case 'sessions.group.project.archived':
                    return 'Project archived'
                case 'sessions.group.activeMembers':
                    return `${values?.count ?? 0} active`
                case 'sessions.group.runningMembers':
                    return `${values?.count ?? 0} running`
                case 'sessions.group.blockedTasks':
                    return `${values?.count ?? 0} blocked`
                case 'sessions.group.archivedMembers':
                    return `${values?.count ?? 0} history`
                case 'sessions.group.showMembers':
                    return `Show ${values?.count ?? 0} members`
                case 'sessions.group.hideMembers':
                    return 'Hide members'
                case 'sessions.empty.sessions':
                    return 'No sessions'
                case 'sessions.new':
                    return 'New Session'
                case 'session.attention.newReply':
                    return 'Reply'
                case 'session.state.processing':
                    return 'Working'
                case 'session.state.awaitingInput':
                    return 'Awaiting input'
                case 'session.state.history':
                    return 'History'
                case 'session.state.readonlyHistory':
                    return 'History only'
                case 'session.more':
                    return 'More actions'
                case 'session.time.justNow':
                    return 'Just now'
                default:
                    return key
            }
        },
    }),
}))

import { SessionList } from './SessionList'

export function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    return createTestSessionListSummary({
        lifecycleStateSince: null,
        ...overrides,
    })
}

export function renderSessionList({
    selectedSessionId = null,
    sessions,
}: {
    selectedSessionId?: string | null
    sessions?: SessionSummary[]
} = {}): RenderResult {
    const now = Date.now()
    const renderedSessions = sessions ?? [
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
            model: 'gpt-5.4-mini',
            modelReasoningEffort: 'high',
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
    ]

    return render(
        createSessionListElement({
            selectedSessionId,
            sessions: renderedSessions,
        })
    )
}

export function createSessionListElement({
    selectedSessionId = null,
    sessions,
}: {
    selectedSessionId?: string | null
    sessions: readonly SessionSummary[]
}): ReactElement {
    return (
        <I18nProvider>
            <SessionList
                sessions={sessions}
                api={null}
                selectedSessionId={selectedSessionId}
                actions={{
                    onSelect: vi.fn(),
                    onNewSession: vi.fn(),
                }}
            />
        </I18nProvider>
    )
}

export const SessionListComponent = SessionList
export const I18nProviderComponent = I18nProvider
