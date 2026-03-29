import { describe, expect, it } from 'bun:test'
import { getSessionLifecycleState } from '@viby/protocol'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SyncEngine } from './syncEngine'

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
        tag: 'team-control-manager',
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
    const memberSession = engine.getOrCreateSession({
        tag: 'team-control-member',
        sessionId: 'member-session-1',
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
    engine.handleSessionAlive({
        sid: memberSession.id,
        time: Date.now()
    })
    store.teams.upsertMember({
        id: 'member-1',
        projectId: managerSession.id,
        sessionId: memberSession.id,
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
        updatedAt: 1_200,
        archivedAt: null,
        removedAt: null
    })
    store.teams.upsertTask({
        id: 'task-1',
        projectId: managerSession.id,
        parentTaskId: null,
        title: 'Fix failing tests',
        description: null,
        acceptanceCriteria: null,
        status: 'running',
        assigneeMemberId: 'member-1',
        reviewerMemberId: null,
        verifierMemberId: null,
        priority: 'high',
        dependsOn: [],
        retryCount: 0,
        createdAt: 1_150,
        updatedAt: 1_250,
        completedAt: null
    })

    return { store, engine, managerSession, memberSession }
}

function setSessionInactive(harness: ReturnType<typeof createHarness>, sessionId: string): void {
    harness.store.sessions.setSessionInactive(sessionId)
    const session = harness.engine.getSession(sessionId)
    if (session) {
        session.active = false
    }
}

describe('team member control actions', () => {
    it('records user interject as both durable team event and transcript messages', async () => {
        const harness = createHarness()

        await harness.engine.interjectTeamMember('member-1', {
            text: '先检查最红的测试'
        })

        const memberMessages = harness.store.messages.getMessages(harness.memberSession.id, 5)
        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        const latestEvent = harness.store.teams.listProjectEvents(harness.managerSession.id, 1)[0]

        expect(latestEvent).toMatchObject({
            kind: 'user-interjected',
            targetId: 'member-1'
        })
        expect(memberMessages[0]?.content).toMatchObject({
            role: 'user',
            content: {
                type: 'text',
                text: '先检查最红的测试'
            },
            meta: {
                sentFrom: 'user',
                memberId: 'member-1',
                sessionRole: 'member',
                teamMessageKind: 'coordination',
                controlOwner: 'manager'
            }
        })
        expect(managerMessages[0]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'team-system',
                memberId: 'member-1',
                sessionRole: 'manager',
                teamMessageKind: 'system-event'
            }
        })
    })

    it('switches control owner through takeover and return without creating a second owner path', async () => {
        const harness = createHarness()

        await harness.engine.takeOverTeamMember('member-1')
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            controlOwner: 'user'
        })

        await harness.engine.returnTeamMember('member-1')
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            controlOwner: 'manager'
        })

        const events = harness.store.teams.listProjectEvents(harness.managerSession.id, 5)
        expect(events.map((event) => event.kind)).toContain('user-takeover-started')
        expect(events.map((event) => event.kind)).toContain('user-takeover-ended')
    })

    it('blocks manager follow-up until the current interject round reaches ready', async () => {
        const harness = createHarness()

        await harness.engine.interjectTeamMember('member-1', {
            text: '先补这条用户插话'
        })

        await expect(harness.engine.messageTeamMember({
            managerSessionId: harness.managerSession.id,
            memberId: 'member-1',
            text: '不要在 ready 前继续插第二条 manager 指令'
        })).rejects.toMatchObject({
            code: 'team_member_control_conflict'
        })

        const readyMessage = harness.store.messages.addMessage(harness.memberSession.id, {
            role: 'agent',
            content: {
                type: 'event',
                data: {
                    type: 'ready'
                }
            }
        })
        harness.engine.handleRealtimeEvent({
            type: 'message-received',
            sessionId: harness.memberSession.id,
            message: {
                id: readyMessage.id,
                seq: readyMessage.seq,
                localId: readyMessage.localId,
                content: readyMessage.content,
                createdAt: readyMessage.createdAt
            }
        })

        await expect(harness.engine.messageTeamMember({
            managerSessionId: harness.managerSession.id,
            memberId: 'member-1',
            text: '现在可以继续安排下一步了'
        })).resolves.toMatchObject({
            member: {
                id: 'member-1'
            }
        })
    })

    it('rejects generic send while a member remains under manager control, but allows it after takeover', async () => {
        const harness = createHarness()

        await expect(harness.engine.sendMessage(harness.memberSession.id, {
            text: '绕过 readonly 直接发给成员'
        })).rejects.toMatchObject({
            code: 'team_member_control_conflict'
        })
        expect(harness.store.messages.getMessages(harness.memberSession.id, 5)).toHaveLength(0)

        await harness.engine.takeOverTeamMember('member-1')

        await expect(harness.engine.sendMessage(harness.memberSession.id, {
            text: '接管后允许继续发给成员'
        })).resolves.toMatchObject({
            id: harness.memberSession.id
        })
        expect(harness.store.messages.getMessages(harness.memberSession.id, 5)[0]?.content).toMatchObject({
            role: 'user',
            content: {
                type: 'text',
                text: '接管后允许继续发给成员'
            },
            meta: {
                sentFrom: 'webapp'
            }
        })
    })

    it('rejects generic send for archived manager-controlled members before any restore path can run', async () => {
        const harness = createHarness()
        await (harness.engine as any).sessionCache.transitionSessionLifecycle(
            harness.memberSession.id,
            'archived',
            {
                markInactive: true,
                archivedBy: 'team',
                archiveReason: 'test archive'
            }
        )
        harness.store.teams.upsertMember({
            ...harness.store.teams.getMember('member-1')!,
            membershipState: 'archived',
            archivedAt: 1_500,
            updatedAt: 1_500
        })

        const startCalls: string[] = []
        ;(harness.engine as any).sessionLifecycleService.startSession = async (sessionId: string) => {
            startCalls.push(sessionId)
            harness.engine.handleSessionAlive({
                sid: sessionId,
                time: Date.now()
            })
            return { type: 'success', sessionId }
        }

        await expect(harness.engine.sendMessage(harness.memberSession.id, {
            text: 'archived member should stay readonly'
        })).rejects.toMatchObject({
            code: 'team_member_control_conflict'
        })

        expect(startCalls).toEqual([])
        expect(harness.store.messages.getMessages(harness.memberSession.id, 5)).toHaveLength(0)
        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            membershipState: 'archived',
            controlOwner: 'manager'
        })
        expect(getSessionLifecycleState(harness.engine.getSession(harness.memberSession.id)!)).toBe('archived')
    })

    it('wakes an inactive manager before appending passive takeover notices', async () => {
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

        expect(harness.engine.getSession(harness.managerSession.id)?.active).toBe(false)

        await harness.engine.takeOverTeamMember('member-1')

        expect(resumeCalls).toEqual([harness.managerSession.id])
        expect(harness.engine.getSession(harness.managerSession.id)?.active).toBe(true)
        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        expect(managerMessages[managerMessages.length - 1]?.content).toMatchObject({
            role: 'user',
            meta: {
                sentFrom: 'team-system',
                memberId: 'member-1',
                sessionRole: 'manager',
                teamMessageKind: 'system-event'
            }
        })
    })

    it('fails takeover before mutating team control when passive manager wake cannot resume', async () => {
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

        await expect(harness.engine.takeOverTeamMember('member-1')).rejects.toMatchObject({
            code: 'no_machine_online',
            status: 409
        })

        expect(harness.store.teams.getMember('member-1')).toMatchObject({
            controlOwner: 'manager',
            membershipState: 'active'
        })
        expect(harness.store.teams.listProjectEvents(harness.managerSession.id, 5).map((event) => event.kind)).toEqual([
            'project-created'
        ])
        expect(harness.store.messages.getMessages(harness.managerSession.id, 5)).toHaveLength(1)
    })

    it('writes a structured handback summary when returning a user-controlled member', async () => {
        const harness = createHarness()

        await harness.engine.takeOverTeamMember('member-1')
        const userMessage = harness.store.messages.addMessage(harness.memberSession.id, {
            role: 'user',
            content: {
                type: 'text',
                text: '我已经先把 failing case 缩小到一个 root cause。'
            },
            meta: {
                sentFrom: 'webapp'
            }
        })
        const replyMessage = harness.store.messages.addMessage(harness.memberSession.id, {
            role: 'agent',
            content: {
                type: 'text',
                text: '最新根因是 review path 仍会穿透 control owner。'
            }
        })
        harness.engine.handleRealtimeEvent({
            type: 'message-received',
            sessionId: harness.memberSession.id,
            message: {
                id: userMessage.id,
                seq: userMessage.seq,
                localId: userMessage.localId,
                content: userMessage.content,
                createdAt: userMessage.createdAt
            }
        })
        harness.engine.handleRealtimeEvent({
            type: 'message-received',
            sessionId: harness.memberSession.id,
            message: {
                id: replyMessage.id,
                seq: replyMessage.seq,
                localId: replyMessage.localId,
                content: replyMessage.content,
                createdAt: replyMessage.createdAt
            }
        })

        await harness.engine.returnTeamMember('member-1')

        const latestEvent = harness.store.teams.listProjectEvents(harness.managerSession.id, 5)[0]
        expect(latestEvent).toMatchObject({
            kind: 'user-takeover-ended',
            targetId: 'member-1',
            payload: {
                summary: {
                    userActions: ['我已经先把 failing case 缩小到一个 root cause。'],
                    currentStatus: '成员最近回复：最新根因是 review path 仍会穿透 control owner。',
                    nextStep: '先阅读接管期间的最新 transcript，再围绕任务「Fix failing tests」继续安排下一步。'
                }
            }
        })

        const managerMessages = harness.store.messages.getMessages(harness.managerSession.id, 5)
        expect(managerMessages[managerMessages.length - 1]?.content).toMatchObject({
            role: 'user',
            content: {
                type: 'text',
                text: expect.stringContaining('用户处理：我已经先把 failing case 缩小到一个 root cause。')
            },
            meta: {
                sentFrom: 'team-system',
                teamMessageKind: 'system-event'
            }
        })
    })
})
