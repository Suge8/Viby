import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@/types/api'
import { buildSessionSections } from './sessionListUtils'

const NOW = 1_900_000_000_000

function createSessionSummary(
    overrides: Partial<SessionSummary> & Pick<SessionSummary, 'id'>
): SessionSummary {
    const { id, ...rest } = overrides

    return {
        id,
        active: false,
        thinking: false,
        activeAt: NOW,
        updatedAt: NOW,
        latestActivityAt: NOW,
        latestActivityKind: 'ready',
        latestCompletedReplyAt: NOW,
        lifecycleState: 'closed',
        lifecycleStateSince: NOW,
        metadata: {
            path: '/Users/sugeh/Project/Viby',
            flavor: 'codex',
            summary: {
                text: id,
                updatedAt: NOW
            }
        },
        todoProgress: null,
        pendingRequestsCount: 0,
        resumeAvailable: false,
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        ...rest
    }
}

describe('sessionListUtils', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('folds manager sessions and their non-archived members into one group row', () => {
        const sections = buildSessionSections([
            createSessionSummary({
                id: 'manager-1',
                lifecycleState: 'running',
                team: {
                    projectId: 'project-1',
                    sessionRole: 'manager',
                    managerSessionId: 'manager-1',
                    managerTitle: 'Manager Alpha',
                    projectStatus: 'active',
                    activeMemberCount: 2,
                    archivedMemberCount: 1,
                    runningMemberCount: 1,
                    blockedTaskCount: 1
                }
            }),
            createSessionSummary({
                id: 'member-1',
                lifecycleState: 'running',
                team: {
                    projectId: 'project-1',
                    sessionRole: 'member',
                    managerSessionId: 'manager-1',
                    managerTitle: 'Manager Alpha',
                    memberRole: 'implementer',
                    memberRevision: 1,
                    membershipState: 'active',
                    controlOwner: 'manager',
                    projectStatus: 'active',
                    activeMemberCount: 2,
                    archivedMemberCount: 1,
                    runningMemberCount: 1,
                    blockedTaskCount: 1
                }
            }),
            createSessionSummary({
                id: 'member-2',
                lifecycleState: 'closed',
                updatedAt: NOW - 1_000,
                team: {
                    projectId: 'project-1',
                    sessionRole: 'member',
                    managerSessionId: 'manager-1',
                    managerTitle: 'Manager Alpha',
                    memberRole: 'reviewer',
                    memberRevision: 1,
                    membershipState: 'active',
                    controlOwner: 'manager',
                    projectStatus: 'active',
                    activeMemberCount: 2,
                    archivedMemberCount: 1,
                    runningMemberCount: 1,
                    blockedTaskCount: 1
                }
            }),
            createSessionSummary({
                id: 'solo-session',
                lifecycleState: 'closed',
                updatedAt: NOW - 2_000
            })
        ])

        expect(sections).toHaveLength(2)
        expect(sections[0]).toMatchObject({
            id: 'running',
            count: 3
        })
        expect(sections[0].rows[0]).toMatchObject({
            kind: 'manager-group',
            manager: { id: 'manager-1' },
            members: [{ id: 'member-1' }, { id: 'member-2' }]
        })
        expect(sections[1]).toMatchObject({
            id: 'recentlyClosed',
            count: 1,
            rows: [{ kind: 'session', session: { id: 'solo-session' } }]
        })
    })

    it('keeps a group in the running section when a member is active but the manager summary is closed', () => {
        const sections = buildSessionSections([
            createSessionSummary({
                id: 'manager-closed',
                lifecycleState: 'closed',
                updatedAt: NOW - 5_000,
                team: {
                    projectId: 'project-2',
                    sessionRole: 'manager',
                    managerSessionId: 'manager-closed',
                    managerTitle: 'Manager Beta',
                    projectStatus: 'active',
                    activeMemberCount: 1,
                    archivedMemberCount: 0,
                    runningMemberCount: 1,
                    blockedTaskCount: 0
                }
            }),
            createSessionSummary({
                id: 'member-running',
                lifecycleState: 'running',
                updatedAt: NOW - 100,
                lifecycleStateSince: NOW - 100,
                team: {
                    projectId: 'project-2',
                    sessionRole: 'member',
                    managerSessionId: 'manager-closed',
                    managerTitle: 'Manager Beta',
                    memberRole: 'implementer',
                    memberRevision: 1,
                    membershipState: 'active',
                    controlOwner: 'manager',
                    projectStatus: 'active',
                    activeMemberCount: 1,
                    archivedMemberCount: 0,
                    runningMemberCount: 1,
                    blockedTaskCount: 0
                }
            })
        ])

        expect(sections).toHaveLength(1)
        expect(sections[0].id).toBe('running')
        expect(sections[0].rows[0]).toMatchObject({
            kind: 'manager-group',
            manager: { id: 'manager-closed' },
            members: [{ id: 'member-running' }]
        })
    })

    it('falls back to standalone member rows when the manager summary is missing from the list payload', () => {
        const sections = buildSessionSections([
            createSessionSummary({
                id: 'member-orphan',
                lifecycleState: 'closed',
                team: {
                    projectId: 'project-3',
                    sessionRole: 'member',
                    managerSessionId: 'manager-missing',
                    managerTitle: 'Manager Missing',
                    memberRole: 'debugger',
                    memberRevision: 1,
                    membershipState: 'active',
                    controlOwner: 'manager',
                    projectStatus: 'active',
                    activeMemberCount: 1,
                    archivedMemberCount: 0,
                    runningMemberCount: 0,
                    blockedTaskCount: 0
                }
            })
        ])

        expect(sections).toHaveLength(1)
        expect(sections[0].rows).toMatchObject([
            { kind: 'session', session: { id: 'member-orphan' } }
        ])
    })
})
