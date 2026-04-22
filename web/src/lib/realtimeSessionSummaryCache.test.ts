import { describe, expect, it } from 'vitest'
import { createTestSessionSummary } from '@/test/sessionFactories'
import type { SessionSummary, SessionsResponse } from '@/types/api'
import { patchSessionSummaryCache, patchSessionSummaryFromMessageCache } from './realtimeSessionSummaryCache'

function createSessionSummary(overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>): SessionSummary {
    return createTestSessionSummary(overrides)
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
                    lifecycleStateSince: 3_000,
                }),
            ],
        }

        const result = patchSessionSummaryCache(previous, 'session-1', {
            lifecycleStateHint: 'archived',
            lifecycleStateSinceHint: 3_100,
        })

        expect(result.patched).toBe(true)
        expect(result.next?.sessions[0]).toMatchObject({
            lifecycleState: 'archived',
            lifecycleStateSince: 3_100,
        })
    })

    it('keeps explicitly open summaries out of history when the inactive patch arrives after abort', () => {
        const previous: SessionsResponse = {
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    active: true,
                    thinking: false,
                    updatedAt: 3_000,
                    lifecycleState: 'running',
                    lifecycleStateSince: 3_000,
                }),
            ],
        }

        const result = patchSessionSummaryCache(previous, 'session-1', {
            active: false,
            lifecycleStateHint: 'open',
            lifecycleStateSinceHint: 3_050,
        })

        expect(result.patched).toBe(true)
        expect(result.next?.sessions[0]).toMatchObject({
            active: false,
            lifecycleState: 'open',
            lifecycleStateSince: 3_050,
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
                    collaborationMode: 'default',
                }),
            ],
        }

        const result = patchSessionSummaryCache(previous, 'session-1', {
            modelReasoningEffort: 'high',
            permissionMode: 'yolo',
            collaborationMode: 'plan',
        })

        expect(result.patched).toBe(true)
        expect(result.next?.sessions[0]).toMatchObject({
            modelReasoningEffort: 'high',
            permissionMode: 'yolo',
            collaborationMode: 'plan',
        })
    })
})

describe('patchSessionSummaryFromMessageCache', () => {
    it('keeps driver-switched marker events out of summary activity and updatedAt', () => {
        const previous: SessionsResponse = {
            sessions: [
                createSessionSummary({
                    id: 'session-1',
                    updatedAt: 5_000,
                    latestActivityAt: 4_000,
                    latestActivityKind: 'ready',
                    latestCompletedReplyAt: 4_000,
                }),
            ],
        }

        const result = patchSessionSummaryFromMessageCache(previous, 'session-1', {
            id: 'message-1',
            seq: 3,
            localId: null,
            createdAt: 6_000,
            content: {
                role: 'agent',
                content: {
                    type: 'event',
                    data: {
                        type: 'driver-switched',
                        previousDriver: 'codex',
                        targetDriver: 'claude',
                    },
                },
            },
        })

        expect(result.patched).toBe(false)
        expect(result.next).toBe(previous)
    })
})
