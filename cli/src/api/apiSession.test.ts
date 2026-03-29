import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamProjectSnapshot } from '@viby/protocol/types'

import type { Session } from './types'
import { ApiSessionClient } from './apiSession'

class FakeSocket {
    private readonly listeners = new Map<string, Array<(...args: any[]) => void>>()
    readonly emitCalls: Array<{ event: string; args: any[] }> = []
    readonly volatileEmitCalls: Array<{ event: string; args: any[] }> = []

    readonly volatile = {
        emit: (event: string, ...args: any[]) => {
            this.volatileEmitCalls.push({ event, args })
        }
    }

    on(event: string, handler: (...args: any[]) => void): this {
        const current = this.listeners.get(event) ?? []
        current.push(handler)
        this.listeners.set(event, current)
        return this
    }

    off(event: string, handler: (...args: any[]) => void): this {
        const current = this.listeners.get(event) ?? []
        this.listeners.set(event, current.filter((entry) => entry !== handler))
        return this
    }

    emit(event: string, ...args: any[]): void {
        this.emitCalls.push({ event, args })
        const handlers = this.listeners.get(event) ?? []
        for (const handler of handlers) {
            handler(...args)
        }
    }

    emitWithAck = vi.fn(async () => ({ result: 'success' }))
    connect = vi.fn()
    disconnect = vi.fn()
    timeout = vi.fn(() => ({
        emitWithAck: vi.fn(async () => undefined)
    }))
}

const { sockets, ioMock } = vi.hoisted(() => {
    const hoistedSockets: FakeSocket[] = []
    const hoistedIoMock = vi.fn(() => {
        const socket = new FakeSocket()
        hoistedSockets.push(socket)
        return socket
    })

    return {
        sockets: hoistedSockets,
        ioMock: hoistedIoMock
    }
})

vi.mock('socket.io-client', () => ({
    io: ioMock
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

vi.mock('@/configuration', () => ({
    configuration: {
        apiUrl: 'http://localhost:3000'
    }
}))

vi.mock('../modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}))

vi.mock('../modules/common/handlers/uploads', () => ({
    cleanupUploadDir: vi.fn(async () => undefined)
}))

vi.mock('@/terminal/TerminalManager', () => ({
    TerminalManager: class {
        closeAll = vi.fn()
        create = vi.fn()
        write = vi.fn()
        resize = vi.fn()
        close = vi.fn()
    }
}))

type RecoverSessionStateMethod = (this: ApiSessionClient) => Promise<void>
type ApplyRecoveredSessionSnapshotMethod = (
    this: ApiSessionClient,
    session: {
        metadata: unknown | null
        metadataVersion: number
        agentState: unknown | null
        agentStateVersion: number
        teamContext?: unknown
    }
) => void

const recoverSessionState = (
    ApiSessionClient.prototype as unknown as { recoverSessionState: RecoverSessionStateMethod }
).recoverSessionState
const applyRecoveredSessionSnapshot = (
    ApiSessionClient.prototype as unknown as { applyRecoveredSessionSnapshot: ApplyRecoveredSessionSnapshotMethod }
).applyRecoveredSessionSnapshot

function createRecoveredMessage(seq: number) {
    return {
        id: `message-${seq}`,
        seq,
        localId: null,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text: `message ${seq}`
            }
        },
        createdAt: seq * 1_000
    }
}

function createRecoveredPage(options: {
    afterSeq: number
    nextAfterSeq: number
    hasMore: boolean
    messageSeqs: number[]
}) {
    return {
        session: {
            id: 'session-1',
            seq: options.nextAfterSeq,
            createdAt: 1,
            updatedAt: options.nextAfterSeq * 1_000,
            active: true,
            activeAt: options.nextAfterSeq * 1_000,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: 0,
            model: null,
            modelReasoningEffort: null,
            permissionMode: 'default',
            collaborationMode: 'default'
        },
        messages: options.messageSeqs.map(createRecoveredMessage),
        page: {
            afterSeq: options.afterSeq,
            nextAfterSeq: options.nextAfterSeq,
            limit: 200,
            hasMore: options.hasMore
        }
    }
}

function createSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        model: null,
        modelReasoningEffort: null,
        permissionMode: 'default',
        collaborationMode: 'default',
        ...overrides
    }
}

function getLatestSessionAlivePayload(socket: FakeSocket): Record<string, unknown> | undefined {
    const call = [...socket.emitCalls].reverse().find((entry) => entry.event === 'session-alive')
    return call?.args[0] as Record<string, unknown> | undefined
}

function createAuthResponse(token = 'web-jwt') {
    return {
        data: {
            token,
            user: {
                id: 1
            }
        },
        headers: {}
    } as any
}

function createUnauthorizedAxiosError(): Error & {
    isAxiosError: true
    response: {
        status: number
        data: Record<string, unknown>
        headers: Record<string, string>
    }
} {
    return Object.assign(new Error('Request failed with status code 401'), {
        isAxiosError: true as const,
        response: {
            status: 401,
            data: {},
            headers: {}
        }
    })
}

afterEach(() => {
    vi.restoreAllMocks()
    sockets.length = 0
    ioMock.mockClear()
})

describe('ApiSessionClient recovery', () => {
    it('recovers snapshots and advances the cursor across recovery pages', async () => {
        const axiosGet = vi.spyOn(axios, 'get')
        axiosGet
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 10,
                    nextAfterSeq: 12,
                    hasMore: true,
                    messageSeqs: [11, 12]
                })
            })
            .mockResolvedValueOnce({
                data: createRecoveredPage({
                    afterSeq: 12,
                    nextAfterSeq: 13,
                    hasMore: false,
                    messageSeqs: [13]
                })
            })

        const createAuthorizedJsonRequestConfig = vi.fn((params?: Record<string, number>) => ({ params }))
        const applyRecoveredSessionSnapshot = vi.fn()
        const handleIncomingMessage = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            backfillInFlight: null,
            lastSeenMessageSeq: 10,
            sessionId: 'session-1',
            createAuthorizedJsonRequestConfig,
            applyRecoveredSessionSnapshot,
            handleIncomingMessage
        }) as ApiSessionClient

        await recoverSessionState.call(client)

        expect(createAuthorizedJsonRequestConfig).toHaveBeenNthCalledWith(1, {
            afterSeq: 10,
            limit: 200
        })
        expect(createAuthorizedJsonRequestConfig).toHaveBeenNthCalledWith(2, {
            afterSeq: 12,
            limit: 200
        })
        expect(axiosGet).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            { params: { afterSeq: 10, limit: 200 } }
        )
        expect(axiosGet).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('/cli/sessions/session-1/recovery'),
            { params: { afterSeq: 12, limit: 200 } }
        )
        expect(applyRecoveredSessionSnapshot).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ id: 'session-1', seq: 12 })
        )
        expect(applyRecoveredSessionSnapshot).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ id: 'session-1', seq: 13 })
        )
        expect(handleIncomingMessage).toHaveBeenCalledTimes(3)
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ seq: 11 })
        )
        expect(handleIncomingMessage).toHaveBeenNthCalledWith(
            3,
            expect.objectContaining({ seq: 13 })
        )
        expect((client as unknown as { backfillInFlight: Promise<void> | null }).backfillInFlight).toBeNull()
    })

    it('refreshes the teamContext snapshot from recovered session state', () => {
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            teamContextSnapshot: undefined,
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0
        }) as ApiSessionClient

        applyRecoveredSessionSnapshot.call(client, {
            metadata: null,
            metadataVersion: 0,
            agentState: null,
            agentStateVersion: 0,
            teamContext: {
                projectId: 'project-1',
                sessionRole: 'member',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                memberRole: 'reviewer',
                memberRevision: 2,
                controlOwner: 'manager',
                membershipState: 'active',
                projectStatus: 'active',
                activeMemberCount: 3,
                archivedMemberCount: 1,
                runningMemberCount: 1,
                blockedTaskCount: 0
            }
        })

        expect(client.getTeamContextSnapshot()).toMatchObject({
            projectId: 'project-1',
            sessionRole: 'member',
            memberRole: 'reviewer',
            memberId: 'member-1'
        })
        expect(client.teamContext).toMatchObject({
            managerSessionId: 'manager-session-1',
            projectStatus: 'active'
        })
    })
})

describe('ApiSessionClient metadata updates', () => {
    it('strips lifecycle fields before sending metadata updates', async () => {
        const client = new ApiSessionClient('token', createSession({
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                lifecycleState: 'archived',
                lifecycleStateSince: 1_000,
                archivedBy: 'web',
                archiveReason: 'Archived by user'
            },
            metadataVersion: 7
        }))
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emitWithAck.mockResolvedValueOnce({
            result: 'success',
            version: 8,
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                name: 'Renamed',
                lifecycleState: 'archived',
                lifecycleStateSince: 1_000,
                archivedBy: 'web',
                archiveReason: 'Archived by user'
            }
        } as any)

        client.updateMetadata((metadata) => ({
            ...metadata,
            name: 'Renamed',
            lifecycleState: 'closed'
        } as typeof metadata & { lifecycleState: 'closed' }))

        await vi.waitFor(() => {
            expect(socket.emitWithAck).toHaveBeenCalledWith('update-metadata', {
                sid: 'session-1',
                expectedVersion: 7,
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    name: 'Renamed'
                },
                touchUpdatedAt: undefined
            })
        })
    })

    it('defers auto summary metadata writes until ready', () => {
        const emit = vi.fn()
        const updateMetadata = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            sessionId: 'session-1',
            socket: { emit },
            updateMetadata,
            pendingAutoSummary: null
        }) as ApiSessionClient

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Streaming title',
            leafUuid: 'leaf-1'
        })

        expect(emit).toHaveBeenCalledWith('message', expect.objectContaining({
            sid: 'session-1',
            message: expect.objectContaining({
                role: 'agent'
            })
        }))
        expect(updateMetadata).not.toHaveBeenCalled()

        client.sendSessionEvent({ type: 'ready' })

        expect(updateMetadata).toHaveBeenCalledWith(expect.any(Function), {
            touchUpdatedAt: false
        })
    })

    it('flushes only the latest pending auto summary when ready arrives', () => {
        const emit = vi.fn()
        const updateMetadata = vi.fn()
        const client = Object.assign(Object.create(ApiSessionClient.prototype), {
            sessionId: 'session-1',
            socket: { emit },
            updateMetadata,
            pendingAutoSummary: null
        }) as ApiSessionClient

        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'First title',
            leafUuid: 'leaf-1'
        })
        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: 'Final title',
            leafUuid: 'leaf-2'
        })

        client.sendSessionEvent({ type: 'ready' })

        expect(updateMetadata).toHaveBeenCalledTimes(1)

        const handler = updateMetadata.mock.calls[0]?.[0] as ((metadata: Record<string, unknown>) => Record<string, unknown>)
        expect(handler({ path: '/tmp/project', host: 'localhost' })).toMatchObject({
            summary: {
                text: 'Final title'
            }
        })
    })
})

describe('ApiSessionClient keepalive continuity', () => {
    it('seeds the initial keepalive snapshot from the session snapshot', () => {
        new ApiSessionClient('token', createSession({
            thinking: true,
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
            metadata: {
                path: '/tmp/project',
                host: 'localhost',
                startedBy: 'runner',
                startedFromRunner: true
            }
        }))
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: true,
            mode: 'remote',
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        }))
    })

    it('replays the latest keepalive snapshot on reconnect instead of resetting to thinking=false', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        client.keepAlive(true, 'remote', {
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        })
        socket.emit('connect')

        expect(getLatestSessionAlivePayload(socket)).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: true,
            mode: 'remote',
            permissionMode: 'safe-yolo',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            collaborationMode: 'plan'
        }))
    })

    it('drops stale runtime fields when the latest keepalive snapshot omits them', () => {
        const client = new ApiSessionClient('token', createSession())
        const socket = sockets[0]
        expect(socket).toBeDefined()
        if (!socket) {
            throw new Error('Expected socket to exist')
        }

        client.keepAlive(true, 'remote', {
            model: 'gpt-5.4',
            modelReasoningEffort: 'high'
        })
        client.keepAlive(false, 'local')
        socket.emit('connect')

        const sessionAlivePayload = getLatestSessionAlivePayload(socket)
        expect(sessionAlivePayload).toEqual(expect.objectContaining({
            sid: 'session-1',
            thinking: false,
            mode: 'local'
        }))
        expect(sessionAlivePayload).not.toHaveProperty('model')
        expect(sessionAlivePayload).not.toHaveProperty('modelReasoningEffort')
    })
})

describe('ApiSessionClient manager teams helpers', () => {
    it('loads authoritative team project snapshots through the dedicated teams API owner', async () => {
        const snapshot: TeamProjectSnapshot = {
            project: {
                id: 'project-1',
                managerSessionId: 'manager-session-1',
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Manager Project',
                goal: 'Ship manager teams',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                createdAt: 1_000,
                updatedAt: 2_000,
                deliveredAt: null,
                archivedAt: null
            },
            roles: [],
            members: [],
            tasks: [],
            events: [],
            acceptance: {
                tasks: {},
                recentResults: []
            },
            compactBrief: {
                project: {
                    id: 'project-1',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    updatedAt: 2_000,
                    deliveredAt: null
                },
                summary: 'Project "Manager Project" has 0 active members, 0 open tasks.',
                counts: {
                    activeMemberCount: 0,
                    inactiveMemberCount: 0,
                    openTaskCount: 0,
                    blockedTaskCount: 0,
                    reviewFailedTaskCount: 0,
                    verificationFailedTaskCount: 0,
                    readyForManagerAcceptanceCount: 0,
                    deliveryReady: false
                },
                staffing: {
                    seatPressure: 'available',
                    remainingMemberSlots: 6,
                    hints: []
                },
                activeMembers: [],
                inactiveMembers: [],
                openTasks: [],
                recentEvents: [],
                recentAcceptanceResults: [],
                wakeReasons: [],
                nextActions: []
            }
        }
        const axiosPost = vi.spyOn(axios, 'post').mockResolvedValueOnce(createAuthResponse())
        const axiosGet = vi.spyOn(axios, 'get').mockResolvedValueOnce({
            data: snapshot,
            headers: {}
        } as any)
        const client = new ApiSessionClient('token', createSession())

        await expect(client.getTeamProject('project-1')).resolves.toEqual(snapshot)
        expect(axiosPost).toHaveBeenCalledWith(
            'http://localhost:3000/api/auth',
            {
                accessToken: 'token'
            },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15_000
            })
        )
        expect(axiosGet).toHaveBeenCalledWith(
            'http://localhost:3000/api/team-projects/project-1',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
    })

    it('posts team acceptance actions through dedicated task routes', async () => {
        const reviewTask = {
            id: 'task-1',
            projectId: 'project-1',
            parentTaskId: null,
            title: 'Ship acceptance chain',
            description: null,
            acceptanceCriteria: 'Review, verify, then accept',
            status: 'in_review',
            assigneeMemberId: 'member-implementer',
            reviewerMemberId: 'member-reviewer',
            verifierMemberId: null,
            priority: 'high',
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_000,
            updatedAt: 2_000,
            completedAt: null
        }
        const acceptedTask = {
            ...reviewTask,
            status: 'done',
            verifierMemberId: 'member-verifier',
            updatedAt: 3_000,
            completedAt: 3_000
        }
        const axiosPost = vi.spyOn(axios, 'post')
        axiosPost
            .mockResolvedValueOnce(createAuthResponse())
            .mockResolvedValueOnce({
                data: { ok: true, task: reviewTask },
                headers: {}
            } as any)
            .mockResolvedValueOnce({
                data: { ok: true, task: acceptedTask },
                headers: {}
            } as any)
        const client = new ApiSessionClient('token', createSession())

        await expect(client.requestTaskReview('task-1', {
            managerSessionId: 'manager-session-1',
            reviewerMemberId: 'member-reviewer',
            note: '重点看回归'
        })).resolves.toEqual(reviewTask)
        await expect(client.acceptTeamTask('task-1', {
            managerSessionId: 'manager-session-1',
            summary: '交付通过'
        })).resolves.toEqual(acceptedTask)

        expect(axiosPost).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/auth',
            {
                accessToken: 'token'
            },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15_000
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/team-tasks/task-1/review-request',
            {
                managerSessionId: 'manager-session-1',
                reviewerMemberId: 'member-reviewer',
                note: '重点看回归'
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            3,
            'http://localhost:3000/api/team-tasks/task-1/accept',
            {
                managerSessionId: 'manager-session-1',
                summary: '交付通过',
                skipVerificationReason: undefined
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
    })

    it('posts role, member, and project orchestration actions through the dedicated routes', async () => {
        const spawnedSession = createSession({
            id: 'member-session-2',
            metadata: {
                path: '/tmp/project-worktrees/member-2',
                host: 'localhost',
                flavor: 'codex'
            }
        })
        const createdRole = {
            projectId: 'project-1',
            id: 'reviewer-mobile',
            source: 'custom',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'simple',
            createdAt: 2_100,
            updatedAt: 2_100
        }
        const updatedRole = {
            ...createdRole,
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
            updatedAt: 2_200
        }
        const member = {
            id: 'member-2',
            projectId: 'project-1',
            sessionId: 'member-session-2',
            managerSessionId: 'manager-session-1',
            role: 'implementer',
            roleId: 'implementer',
            providerFlavor: 'codex',
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            isolationMode: 'worktree',
            workspaceRoot: '/tmp/project-worktrees/member-2',
            controlOwner: 'manager',
            membershipState: 'active',
            revision: 2,
            supersedesMemberId: 'member-1',
            supersededByMemberId: null,
            spawnedForTaskId: 'task-1',
            createdAt: 2_000,
            updatedAt: 2_000,
            archivedAt: null,
            removedAt: null
        }
        const project = {
            id: 'project-1',
            managerSessionId: 'manager-session-1',
            machineId: 'machine-1',
            rootDirectory: '/tmp/project',
            title: 'Manager Project',
            goal: 'Ship manager teams',
            status: 'delivered',
            maxActiveMembers: 6,
            defaultIsolationMode: 'hybrid',
            createdAt: 1_000,
            updatedAt: 3_000,
            deliveredAt: 3_000,
            archivedAt: null
        }
        const axiosPost = vi.spyOn(axios, 'post')
        const axiosPatch = vi.spyOn(axios, 'patch')
        const axiosDelete = vi.spyOn(axios, 'delete')
        axiosPost
            .mockResolvedValueOnce(createAuthResponse())
            .mockResolvedValueOnce({
                data: {
                    ok: true,
                    role: createdRole
                },
                headers: {}
            } as any)
            .mockResolvedValueOnce({
                data: {
                    ok: true,
                    member,
                    session: spawnedSession,
                    launch: {
                        strategy: 'revision',
                        reason: 'provider_flavor_changed',
                        previousMemberId: 'member-1'
                    }
                },
                headers: {}
            } as any)
            .mockResolvedValueOnce({
                data: {
                    ok: true,
                    project
                },
                headers: {}
            } as any)
        axiosPatch
            .mockResolvedValueOnce({
                data: {
                    ok: true,
                    role: updatedRole
                },
                headers: {}
            } as any)
            .mockResolvedValueOnce({
                data: {
                    ok: true,
                    action: 'remove',
                    member: {
                        ...member,
                        membershipState: 'removed',
                        removedAt: 3_100
                    }
                },
                headers: {}
            } as any)
        axiosDelete.mockResolvedValueOnce({
            data: {
                ok: true,
                roleId: 'reviewer-mobile'
            },
            headers: {}
        } as any)
        const client = new ApiSessionClient('token', createSession())

        await expect(client.createTeamRole('project-1', {
            managerSessionId: 'manager-session-1',
            roleId: 'reviewer-mobile',
            prototype: 'reviewer',
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.'
        })).resolves.toEqual(createdRole)
        await expect(client.updateTeamRole('project-1', 'reviewer-mobile', {
            managerSessionId: 'manager-session-1',
            name: 'Mobile Review Lead',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
        })).resolves.toEqual(updatedRole)
        await expect(client.deleteTeamRole('project-1', 'reviewer-mobile', {
            managerSessionId: 'manager-session-1'
        })).resolves.toBe('reviewer-mobile')
        await expect(client.spawnTeamMember({
            managerSessionId: 'manager-session-1',
            roleId: 'implementer',
            taskId: 'task-1'
        })).resolves.toMatchObject({
            member: expect.objectContaining({ id: 'member-2' }),
            launch: {
                strategy: 'revision',
                reason: 'provider_flavor_changed',
                previousMemberId: 'member-1'
            }
        })
        await expect(client.updateTeamMember('member-2', {
            action: 'remove',
            managerSessionId: 'manager-session-1'
        })).resolves.toMatchObject({
            action: 'remove',
            member: expect.objectContaining({
                membershipState: 'removed'
            })
        })
        await expect(client.closeTeamProject('project-1', {
            managerSessionId: 'manager-session-1',
            summary: '交付完成'
        })).resolves.toEqual(project)

        expect(axiosPost).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/auth',
            {
                accessToken: 'token'
            },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15_000
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/team-projects/project-1/roles',
            {
                managerSessionId: 'manager-session-1',
                roleId: 'reviewer-mobile',
                prototype: 'reviewer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.'
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
        expect(axiosPatch).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/team-projects/project-1/roles/reviewer-mobile',
            {
                managerSessionId: 'manager-session-1',
                name: 'Mobile Review Lead',
                promptExtension: 'Focus on mobile regressions and pwa-safe interactions.',
                providerFlavor: undefined,
                model: undefined,
                reasoningEffort: undefined,
                isolationMode: undefined
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
        expect(axiosDelete).toHaveBeenCalledWith(
            'http://localhost:3000/api/team-projects/project-1/roles/reviewer-mobile',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000,
                data: {
                    managerSessionId: 'manager-session-1'
                }
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            3,
            'http://localhost:3000/api/team-members',
            {
                managerSessionId: 'manager-session-1',
                roleId: 'implementer',
                taskId: 'task-1',
                instruction: undefined,
                taskGoal: undefined,
                artifactSummary: undefined,
                attemptSummary: undefined,
                failureSummary: undefined,
                reviewSummary: undefined
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
        expect(axiosPatch).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/team-members/member-2',
            {
                action: 'remove',
                managerSessionId: 'manager-session-1'
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            4,
            'http://localhost:3000/api/team-projects/project-1/close',
            {
                managerSessionId: 'manager-session-1',
                summary: '交付完成'
            },
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer web-jwt',
                    'Content-Type': 'application/json'
                }),
                timeout: 15_000
            })
        )
    })

    it('refreshes the cached web jwt once when a team route returns 401', async () => {
        const snapshot: TeamProjectSnapshot = {
            project: {
                id: 'project-1',
                managerSessionId: 'manager-session-1',
                machineId: 'machine-1',
                rootDirectory: '/tmp/project',
                title: 'Manager Project',
                goal: 'Ship manager teams',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                createdAt: 1_000,
                updatedAt: 2_000,
                deliveredAt: null,
                archivedAt: null
            },
            roles: [],
            members: [],
            tasks: [],
            events: [],
            acceptance: {
                tasks: {},
                recentResults: []
            },
            compactBrief: {
                project: {
                    id: 'project-1',
                    title: 'Manager Project',
                    goal: 'Ship manager teams',
                    status: 'active',
                    maxActiveMembers: 6,
                    defaultIsolationMode: 'hybrid',
                    updatedAt: 2_000,
                    deliveredAt: null
                },
                summary: 'Project "Manager Project" has 0 active members, 0 open tasks.',
                counts: {
                    activeMemberCount: 0,
                    inactiveMemberCount: 0,
                    openTaskCount: 0,
                    blockedTaskCount: 0,
                    reviewFailedTaskCount: 0,
                    verificationFailedTaskCount: 0,
                    readyForManagerAcceptanceCount: 0,
                    deliveryReady: false
                },
                staffing: {
                    seatPressure: 'available',
                    remainingMemberSlots: 6,
                    hints: []
                },
                activeMembers: [],
                inactiveMembers: [],
                openTasks: [],
                recentEvents: [],
                recentAcceptanceResults: [],
                wakeReasons: [],
                nextActions: []
            }
        }
        const axiosPost = vi.spyOn(axios, 'post')
        axiosPost
            .mockResolvedValueOnce(createAuthResponse('stale-web-jwt'))
            .mockResolvedValueOnce(createAuthResponse('fresh-web-jwt'))
        const axiosGet = vi.spyOn(axios, 'get')
        axiosGet
            .mockRejectedValueOnce(createUnauthorizedAxiosError())
            .mockResolvedValueOnce({
                data: snapshot,
                headers: {}
            } as any)
        const client = new ApiSessionClient('token', createSession())

        await expect(client.getTeamProject('project-1')).resolves.toEqual(snapshot)

        expect(axiosPost).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/auth',
            {
                accessToken: 'token'
            },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15_000
            })
        )
        expect(axiosPost).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/auth',
            {
                accessToken: 'token'
            },
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 15_000
            })
        )
        expect(axiosGet).toHaveBeenNthCalledWith(
            1,
            'http://localhost:3000/api/team-projects/project-1',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer stale-web-jwt'
                })
            })
        )
        expect(axiosGet).toHaveBeenNthCalledWith(
            2,
            'http://localhost:3000/api/team-projects/project-1',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer fresh-web-jwt'
                })
            })
        )
    })
})
