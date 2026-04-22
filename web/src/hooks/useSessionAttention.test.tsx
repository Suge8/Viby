import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetForegroundPulseForTests } from '@/lib/foregroundPulse'
import { seedSessionAttentionSnapshotForTests } from '@/lib/sessionAttentionStore'
import { TEST_PROJECT_PATH } from '@/test/sessionFactories'
import type { SessionSummary } from '@/types/api'
import { useSessionAttention } from './useSessionAttention'

const SEEN_AT = 1_700_000_000_000
const REPLY_AT = 1_700_000_060_000

function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    const { id, ...rest } = overrides

    return {
        active: false,
        thinking: false,
        activeAt: 0,
        updatedAt: 0,
        latestActivityAt: 0,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: 0,
        lifecycleState: 'closed',
        lifecycleStateSince: 0,
        metadata: {
            path: TEST_PROJECT_PATH,
            driver: 'codex',
            summary: { text: 'Summary', updatedAt: 0 },
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        resumeStrategy: 'none',
        model: null,
        modelReasoningEffort: null,
        ...rest,
        id,
    }
}

describe('useSessionAttention', () => {
    beforeEach(() => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        })
    })

    afterEach(() => {
        resetForegroundPulseForTests()
    })

    it('reports a new reply when latestCompletedReplyAt is newer than the stored seen timestamp', async () => {
        const session = createSessionSummary({
            id: 'session-2',
            latestCompletedReplyAt: REPLY_AT,
        })
        await seedSessionAttentionSnapshotForTests({
            'session-2': SEEN_AT,
        })

        const { result } = renderHook(() => useSessionAttention([session], null))

        expect(result.current.hasUnseenReply(session)).toBe(true)
    })

    it('marks the selected session as seen through the shared browser storage boundary', async () => {
        const session = createSessionSummary({
            id: 'session-1',
            latestCompletedReplyAt: REPLY_AT,
        })
        await seedSessionAttentionSnapshotForTests({
            'session-1': SEEN_AT,
        })
        const initialProps: { selectedSessionId: string | null } = {
            selectedSessionId: 'session-1',
        }

        const { result, rerender } = renderHook(
            ({ selectedSessionId }: { selectedSessionId: string | null }) =>
                useSessionAttention([session], selectedSessionId),
            {
                initialProps,
            }
        )

        await waitFor(() => {
            expect(result.current.hasUnseenReply(session)).toBe(false)
        })

        rerender({ selectedSessionId: null })

        expect(result.current.hasUnseenReply(session)).toBe(false)
    })
})
