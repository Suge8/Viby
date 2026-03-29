import { describe, expect, it } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import {
    SyncEngine,
    TeamAcceptanceError
} from './syncEngine'

function createIoStub(): Server {
    return {
        of() {
            return {
                to() {
                    return {
                        emit() {
                        }
                    }
                }
            }
        }
    } as unknown as Server
}

function createHarness() {
    const store = new Store(':memory:')
    const engine = new SyncEngine(
        store,
        createIoStub(),
        {} as RpcRegistry,
        { broadcast() {} }
    )
    const managerSession = engine.getOrCreateSession({
        tag: 'acceptance-manager',
        sessionId: 'manager-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex',
            name: 'Manager'
        },
        agentState: null,
        model: 'gpt-5.4',
        sessionRole: 'manager'
    })
    const implementerSession = engine.getOrCreateSession({
        tag: 'acceptance-implementer',
        sessionId: 'implementer-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        agentState: null,
        model: 'gpt-5.4'
    })
    const reviewerSession = engine.getOrCreateSession({
        tag: 'acceptance-reviewer',
        sessionId: 'reviewer-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        agentState: null,
        model: 'gpt-5.4'
    })
    const verifierSession = engine.getOrCreateSession({
        tag: 'acceptance-verifier',
        sessionId: 'verifier-session-1',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            flavor: 'codex'
        },
        agentState: null,
        model: 'gpt-5.4'
    })

    engine.handleSessionAlive({
        sid: managerSession.id,
        time: Date.now()
    })
    for (const session of [implementerSession, reviewerSession, verifierSession]) {
        engine.handleSessionAlive({
            sid: session.id,
            time: Date.now()
        })
    }

    store.teams.upsertMember({
        id: 'member-implementer',
        projectId: managerSession.id,
        sessionId: implementerSession.id,
        managerSessionId: managerSession.id,
        role: 'implementer',
        roleId: 'implementer',
        providerFlavor: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: 'simple',
        workspaceRoot: null,
        controlOwner: 'manager',
        membershipState: 'active',
        revision: 1,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: 'task-1',
        createdAt: 1_100,
        updatedAt: 1_100,
        archivedAt: null,
        removedAt: null
    })
    store.teams.upsertMember({
        id: 'member-reviewer',
        projectId: managerSession.id,
        sessionId: reviewerSession.id,
        managerSessionId: managerSession.id,
        role: 'reviewer',
        roleId: 'reviewer',
        providerFlavor: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: 'simple',
        workspaceRoot: null,
        controlOwner: 'manager',
        membershipState: 'active',
        revision: 1,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: null,
        createdAt: 1_101,
        updatedAt: 1_101,
        archivedAt: null,
        removedAt: null
    })
    store.teams.upsertMember({
        id: 'member-verifier',
        projectId: managerSession.id,
        sessionId: verifierSession.id,
        managerSessionId: managerSession.id,
        role: 'verifier',
        roleId: 'verifier',
        providerFlavor: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: 'simple',
        workspaceRoot: null,
        controlOwner: 'manager',
        membershipState: 'active',
        revision: 1,
        supersedesMemberId: null,
        supersededByMemberId: null,
        spawnedForTaskId: null,
        createdAt: 1_102,
        updatedAt: 1_102,
        archivedAt: null,
        removedAt: null
    })
    store.teams.upsertTask({
        id: 'task-1',
        projectId: managerSession.id,
        parentTaskId: null,
        title: 'Ship acceptance chain',
        description: 'Implement durable acceptance workflow',
        acceptanceCriteria: 'Review, verify, then final accept',
        status: 'running',
        assigneeMemberId: 'member-implementer',
        reviewerMemberId: null,
        verifierMemberId: null,
        priority: 'high',
        dependsOn: [],
        retryCount: 0,
        createdAt: 1_120,
        updatedAt: 1_120,
        completedAt: null
    })

    return {
        store,
        engine,
        managerSession,
        implementerSession,
        reviewerSession,
        verifierSession
    }
}

function setSessionInactive(harness: ReturnType<typeof createHarness>, sessionId: string): void {
    harness.store.sessions.setSessionInactive(sessionId)
    const session = harness.engine.getSession(sessionId)
    if (session) {
        session.active = false
    }
}

describe('team acceptance actions', () => {
    it('runs review -> verification -> manager acceptance as a durable chain', async () => {
        const harness = createHarness()

        await harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer',
            note: '重点看回归和测试'
        })
        await harness.engine.submitTaskReviewResult({
            memberId: 'member-reviewer',
            taskId: 'task-1',
            decision: 'accept',
            summary: '实现边界清楚，测试覆盖足够。'
        })
        await harness.engine.requestTaskVerification({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            verifierMemberId: 'member-verifier',
            note: '跑 focused validation'
        })
        await harness.engine.submitTaskVerificationResult({
            memberId: 'member-verifier',
            taskId: 'task-1',
            decision: 'pass',
            summary: 'focused tests 和 smoke 均通过。'
        })
        await harness.engine.acceptTeamTask({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            summary: '验收通过，准备交付。'
        })

        expect(harness.store.teams.getTask('task-1')).toMatchObject({
            status: 'done',
            reviewerMemberId: 'member-reviewer',
            verifierMemberId: 'member-verifier'
        })

        const taskEvents = harness.store.teams.listTaskEvents('task-1')
        expect(taskEvents.map((event) => event.kind)).toEqual([
            'review-requested',
            'review-passed',
            'verification-requested',
            'verification-passed',
            'manager-accepted'
        ])

        const reviewerMessages = harness.store.messages.getMessages(harness.reviewerSession.id, 5)
        expect(reviewerMessages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                memberId: 'member-reviewer',
                sessionRole: 'member',
                teamMessageKind: 'review-request'
            }
        })

        const verifierMessages = harness.store.messages.getMessages(harness.verifierSession.id, 5)
        expect(verifierMessages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'manager',
                memberId: 'member-verifier',
                sessionRole: 'member',
                teamMessageKind: 'verify-request'
            }
        })
    })

    it('returns the task to running and increments retry count when review requests changes', async () => {
        const harness = createHarness()

        await harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })
        await harness.engine.submitTaskReviewResult({
            memberId: 'member-reviewer',
            taskId: 'task-1',
            decision: 'request_changes',
            summary: '缺少关键回归测试。'
        })

        expect(harness.store.teams.getTask('task-1')).toMatchObject({
            status: 'running',
            retryCount: 1,
            verifierMemberId: null
        })

        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        expect(managerMessages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'team-system',
                sessionRole: 'manager',
                teamMessageKind: 'system-event'
            }
        })
    })

    it('wakes an inactive manager before appending review-result notices', async () => {
        const harness = createHarness()
        harness.store.messages.addMessage(harness.managerSession.id, {
            role: 'assistant',
            content: {
                type: 'text',
                text: 'existing manager transcript'
            }
        })
        setSessionInactive(harness, harness.managerSession.id)
        const resumeCalls: string[] = []
        ;(harness.engine as any).resumeSession = async (sessionId: string) => {
            resumeCalls.push(sessionId)
            harness.engine.handleSessionAlive({
                sid: sessionId,
                time: Date.now()
            })
            return { type: 'success', sessionId }
        }

        await harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })
        expect(harness.engine.getSession(harness.managerSession.id)?.active).toBe(false)

        await harness.engine.submitTaskReviewResult({
            memberId: 'member-reviewer',
            taskId: 'task-1',
            decision: 'request_changes',
            summary: '还需要再补 focused verification。'
        })

        expect(resumeCalls).toEqual([harness.managerSession.id])
        expect(harness.engine.getSession(harness.managerSession.id)?.active).toBe(true)
        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        expect(managerMessages[managerMessages.length - 1]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'team-system',
                memberId: 'member-reviewer',
                sessionRole: 'manager',
                teamMessageKind: 'system-event'
            }
        })
    })

    it('fails review-result before mutating acceptance state when passive manager wake cannot resume', async () => {
        const harness = createHarness()
        harness.store.messages.addMessage(harness.managerSession.id, {
            role: 'assistant',
            content: {
                type: 'text',
                text: 'existing manager transcript'
            }
        })
        setSessionInactive(harness, harness.managerSession.id)
        ;(harness.engine as any).resumeSession = async () => ({
            type: 'error',
            code: 'no_machine_online',
            message: 'No machine online'
        })

        await harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })

        await expect(harness.engine.submitTaskReviewResult({
            memberId: 'member-reviewer',
            taskId: 'task-1',
            decision: 'request_changes',
            summary: '还需要再补 focused verification。'
        })).rejects.toMatchObject({
            code: 'no_machine_online',
            status: 409
        })

        expect(harness.store.teams.getTask('task-1')).toMatchObject({
            status: 'in_review',
            retryCount: 0,
            reviewerMemberId: 'member-reviewer'
        })
        expect(harness.store.teams.listTaskEvents('task-1').map((event) => event.kind)).toEqual([
            'review-requested'
        ])
        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        expect(managerMessages).toHaveLength(1)
        expect(managerMessages[0]?.content).toMatchObject({
            role: 'assistant'
        })
    })

    it('requires verification before final acceptance unless the skip reason is explicit', async () => {
        const harness = createHarness()

        await harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })
        await harness.engine.submitTaskReviewResult({
            memberId: 'member-reviewer',
            taskId: 'task-1',
            decision: 'accept',
            summary: 'review 通过。'
        })

        await expect(harness.engine.acceptTeamTask({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1'
        })).rejects.toThrow(TeamAcceptanceError)

        await harness.engine.acceptTeamTask({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            skipVerificationReason: '这是纯 design exploration，本轮显式跳过 verifier。'
        })

        expect(harness.store.teams.getTask('task-1')).toMatchObject({
            status: 'done'
        })
        expect(harness.engine.getTeamProjectSnapshot(harness.managerSession.id)?.acceptance.tasks['task-1']).toMatchObject({
            reviewStatus: 'passed',
            verificationStatus: 'idle',
            managerAccepted: true,
            skipVerificationReason: '这是纯 design exploration，本轮显式跳过 verifier。'
        })
    })

    it('blocks manager review requests while the reviewer is under user control', async () => {
        const harness = createHarness()

        await harness.engine.takeOverTeamMember('member-reviewer')

        await expect(harness.engine.requestTaskReview({
            managerSessionId: harness.managerSession.id,
            taskId: 'task-1',
            reviewerMemberId: 'member-reviewer'
        })).rejects.toMatchObject({
            code: 'team_member_control_conflict'
        })
    })
})
