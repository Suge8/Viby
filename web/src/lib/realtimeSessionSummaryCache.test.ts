import { describe, expect, it } from 'vitest'
import type { SessionsResponse, SessionSummary } from '@/types/api'
import { patchSessionSummaryCache } from './realtimeSessionSummaryCache'

function createSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const {
        id,
        latestActivityAt = 0,
        latestActivityKind = 'ready',
        latestCompletedReplyAt = 0,
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
            path: '/tmp/project',
            flavor: 'codex',
            summary: { text: 'Summary', updatedAt: 0 }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        model: null,
        modelReasoningEffort: null,
        ...restOverrides
    }
}

describe('patchSessionSummaryCache', () => {
    it('promotes closed summaries to archived when lifecycle metadata arrives after inactive patch', () => {
        const previous: SessionsResponse = {
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    active: false,
                    updatedAt: 3_000,
                    lifecycleState: 'closed',
                    lifecycleStateSince: 3_000
                })
            ]
        }

        const result = patchSessionSummaryCache(previous, 'session-1', {
            lifecycleStateHint: 'archived',
            lifecycleStateSinceHint: 3_100
        })

        expect(result.patched).toBe(true)
        expect(result.next?.sessions[0]).toMatchObject({
            lifecycleState: 'archived',
            lifecycleStateSince: 3_100
        })
    })

    it('keeps live config summary fields in sync for placeholder seeds', () => {
        const previous: SessionsResponse = {
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    model: 'gpt-5.4',
                    modelReasoningEffort: null,
                    permissionMode: 'default',
                    collaborationMode: 'default'
                })
            ]
        }

        const result = patchSessionSummaryCache(previous, 'session-1', {
            modelReasoningEffort: 'high',
            permissionMode: 'yolo',
            collaborationMode: 'plan'
        })

        expect(result.patched).toBe(true)
        expect(result.next?.sessions[0]).toMatchObject({
            modelReasoningEffort: 'high',
            permissionMode: 'yolo',
            collaborationMode: 'plan'
        })
    })
})
