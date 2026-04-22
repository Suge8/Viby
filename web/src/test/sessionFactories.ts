import type { Session, SessionSummary } from '@/types/api'

export const TEST_PROJECT_PATH = '/tmp/viby-test/project'
export const TEST_BAO_PROJECT_PATH = '/tmp/viby-test/bao'
export const TEST_OPEN_PROJECT_PATH = '/tmp/viby-test/open'
export const TEST_HISTORY_PROJECT_PATH = '/tmp/viby-test/history'
export const TEST_NEXT_PROJECT_PATH = '/tmp/viby-test/next-project'
export const TEST_RUNTIME_HOME_PATH = '/tmp/viby-test/home'
export const TEST_RUNTIME_PROJECTS_PATH = `${TEST_RUNTIME_HOME_PATH}/projects`
export const TEST_RUNTIME_PROJECT_PATH = `${TEST_RUNTIME_PROJECTS_PATH}/viby`

export function createTestSession(overrides: Partial<Session> & Pick<Session, 'id'>): Session {
    const { id, metadata, ...restOverrides } = overrides

    return {
        id,
        seq: 1,
        createdAt: 1_000,
        updatedAt: 1_000,
        active: true,
        activeAt: 1_000,
        metadata: {
            path: TEST_PROJECT_PATH,
            host: 'localhost',
            driver: 'codex',
            ...metadata,
        },
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {},
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1_000,
        todos: undefined,
        model: null,
        modelReasoningEffort: null,
        permissionMode: undefined,
        collaborationMode: undefined,
        ...restOverrides,
    }
}

export function createTestSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const {
        id,
        latestActivityAt = 0,
        latestActivityKind = 'ready',
        latestCompletedReplyAt = 0,
        metadata,
        ...restOverrides
    } = overrides

    return {
        id,
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        latestActivityAt,
        latestActivityKind,
        latestCompletedReplyAt,
        lifecycleState: 'closed',
        lifecycleStateSince: 0,
        metadata: {
            path: TEST_PROJECT_PATH,
            driver: 'codex',
            summary: { text: 'Summary', updatedAt: 0 },
            ...metadata,
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        resumeStrategy: 'none',
        model: null,
        modelReasoningEffort: null,
        ...restOverrides,
    }
}

export function createTestSessionListSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const { id, ...restOverrides } = overrides

    return createTestSessionSummary({
        id,
        activeAt: 1_000,
        updatedAt: 1_000,
        latestActivityAt: 1_000,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 1_000,
        lifecycleStateSince: 1_000,
        metadata: {
            path: TEST_PROJECT_PATH,
            driver: 'codex',
            summary: {
                text: id,
                updatedAt: 1_000,
            },
        },
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        ...restOverrides,
    })
}
