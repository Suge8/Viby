import type { SessionDriver, SessionStreamState } from '@viby/protocol/types'
import { Hono } from 'hono'
import {
    getSessionCommandResumeStatus,
    type SessionCommandRequest,
    SessionCommandService,
} from '../../sync/sessionCommandService'
import type { DriverSwitchResult } from '../../sync/sessionLifecycleService'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createPermissionsRoutes } from './permissions'
import { createSessionsRoutes } from './sessions'

export const DEFAULT_PERMISSION_REQUEST_ID = 'request-1'

export function createSession(overrides?: Partial<Session>): Session {
    const baseMetadata = {
        path: '/tmp/project',
        host: 'localhost',
        driver: 'codex' as const,
    }
    const base: Session = {
        id: 'session-1',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: baseMetadata,
        metadataVersion: 1,
        agentState: {
            controlledByUser: false,
            requests: {},
            completedRequests: {},
        },
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        model: 'gpt-5.4',
        modelReasoningEffort: null,
        codexServiceTier: null,
        permissionMode: 'default',
        collaborationMode: 'default',
    }

    return {
        ...base,
        ...overrides,
        metadata:
            overrides?.metadata === undefined
                ? base.metadata
                : overrides.metadata === null
                  ? null
                  : {
                        ...baseMetadata,
                        ...overrides.metadata,
                    },
        agentState: overrides?.agentState === undefined ? base.agentState : overrides.agentState,
    }
}

export function createApp(
    session: Session,
    options?: {
        abortSessionResult?: Session
        deleteSessionError?: Error & { status?: number }
        latestWindowMessages?: Array<{
            id: string
            seq: number | null
            localId: string | null
            content: unknown
            createdAt: number
        }>
        latestWindowHasMore?: boolean
        resumeResult?: Awaited<ReturnType<SyncEngine['resumeSession']>>
        stream?: SessionStreamState | null
        switchDriverResult?: DriverSwitchResult
        dropSessionSnapshotAfterConfig?: boolean
        commandCapabilitiesResult?: Awaited<ReturnType<SyncEngine['listCommandCapabilities']>>
    }
) {
    const abortSessionCalls: string[] = []
    const applySessionConfigCalls: Array<[string, Record<string, unknown>]> = []
    const approvePermissionCalls: Array<
        [
            string,
            string,
            unknown,
            string[] | undefined,
            string | undefined,
            Record<string, string[]> | Record<string, { answers: string[] }> | undefined,
        ]
    > = []
    const archiveSessionCalls: string[] = []
    const closeSessionCalls: string[] = []
    const deleteSessionCalls: string[] = []
    const denyPermissionCalls: Array<[string, string, string | undefined]> = []
    const listCommandCapabilitiesCalls: Array<[string, string, string | undefined]> = []
    const recoveryCalls: Array<[string, { afterSeq: number; limit: number }]> = []
    const resumeSessionCalls: Array<[string, { permissionMode?: string } | undefined]> = []
    const switchDriverCalls: Array<[string, SessionDriver]> = []
    let currentSession = session
    let sessionSnapshotAvailable = true
    const renameSessionCalls: Array<[string, string]> = []
    const unarchiveSessionCalls: string[] = []
    const applySessionConfig = async (sessionId: string, config: Record<string, unknown>) => {
        applySessionConfigCalls.push([sessionId, config])
        currentSession = {
            ...currentSession,
            model: 'model' in config ? ((config.model as Session['model']) ?? null) : currentSession.model,
            modelReasoningEffort:
                'modelReasoningEffort' in config
                    ? ((config.modelReasoningEffort as Session['modelReasoningEffort']) ?? null)
                    : currentSession.modelReasoningEffort,
            codexServiceTier:
                'codexServiceTier' in config
                    ? ((config.codexServiceTier as Session['codexServiceTier']) ?? null)
                    : currentSession.codexServiceTier,
            permissionMode:
                'permissionMode' in config
                    ? (config.permissionMode as Session['permissionMode'])
                    : currentSession.permissionMode,
            collaborationMode:
                'collaborationMode' in config
                    ? (config.collaborationMode as Session['collaborationMode'])
                    : currentSession.collaborationMode,
            updatedAt: currentSession.updatedAt + 1,
        }
        if (options?.dropSessionSnapshotAfterConfig) {
            sessionSnapshotAvailable = false
        }
    }
    const resumeSessionCore = async (sessionId: string, _hooks?: unknown, opts?: { permissionMode?: string }) => {
        resumeSessionCalls.push([sessionId, opts])
        const result = options?.resumeResult ?? {
            type: 'success' as const,
            sessionId,
        }
        if (result.type === 'success') {
            currentSession = {
                ...currentSession,
                active: true,
                activeAt: currentSession.updatedAt + 1,
                updatedAt: currentSession.updatedAt + 1,
                metadata: currentSession.metadata
                    ? {
                          ...currentSession.metadata,
                          lifecycleState: 'running',
                          lifecycleStateSince: currentSession.updatedAt + 1,
                      }
                    : null,
            }
        }
        return result
    }
    const sessionCommandService = new SessionCommandService(
        {
            getSession: () => (sessionSnapshotAvailable ? currentSession : undefined),
            refreshSession: () => (sessionSnapshotAvailable ? currentSession : undefined),
            setSessionLifecycleState: async () => currentSession,
            setSessionThinking: () => currentSession,
            applySessionConfig: (sessionId: string, config: Record<string, unknown>) => {
                void applySessionConfig(sessionId, config)
            },
        } as never,
        { abortSession: async () => undefined } as never,
        { resumeSession: resumeSessionCore } as never,
        { requestSessionConfig: applySessionConfig } as never
    )
    const engine = {
        getSession: () => (sessionSnapshotAvailable ? currentSession : undefined),
        approvePermission: async (
            sessionId: string,
            requestId: string,
            mode?: unknown,
            allowTools?: string[],
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort',
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        ) => {
            approvePermissionCalls.push([sessionId, requestId, mode, allowTools, decision, answers])
        },
        deleteSession: async (sessionId: string) => {
            deleteSessionCalls.push(sessionId)
            if (options?.deleteSessionError) {
                throw options.deleteSessionError
            }
        },
        denyPermission: async (
            sessionId: string,
            requestId: string,
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        ) => {
            denyPermissionCalls.push([sessionId, requestId, decision])
        },
        getSessionRecoveryPage: (sessionId: string, options: { afterSeq: number; limit: number }) => {
            recoveryCalls.push([sessionId, options])
            return {
                session: currentSession,
                messages: [],
                page: {
                    afterSeq: options.afterSeq,
                    nextAfterSeq: options.afterSeq,
                    limit: options.limit,
                    hasMore: false,
                },
            }
        },
        getMessagesPage: (_sessionId: string, pageOptions: { limit: number; beforeSeq: number | null }) => ({
            messages: pageOptions.beforeSeq === null ? (options?.latestWindowMessages ?? []) : [],
            page: {
                limit: pageOptions.limit,
                beforeSeq: pageOptions.beforeSeq,
                nextBeforeSeq: null,
                hasMore: pageOptions.beforeSeq === null ? (options?.latestWindowHasMore ?? false) : false,
            },
        }),
        listCommandCapabilities: async (sessionId: string, agent: string, revision?: string) => {
            listCommandCapabilitiesCalls.push([sessionId, agent, revision])
            return (
                options?.commandCapabilitiesResult ?? {
                    success: true,
                    capabilities: [],
                }
            )
        },
        renameSession: async (sessionId: string, name: string) => {
            renameSessionCalls.push([sessionId, name])
            currentSession = {
                ...currentSession,
                metadata: currentSession.metadata ? { ...currentSession.metadata, name } : null,
                metadataVersion: currentSession.metadataVersion + 1,
            }
            return currentSession
        },
        resumeSession: async (sessionId: string, opts?: { permissionMode?: string }) => {
            const result = await sessionCommandService.executeSessionCommand({
                type: 'resume',
                sessionId,
                permissionMode: opts?.permissionMode as never,
            })
            if (result.ok) {
                return (
                    result.resume ?? { type: 'error', message: 'Session resume failed', code: 'session_action_failed' }
                )
            }
            return { type: 'error', message: result.error.message, code: result.error.code }
        },
        executeSessionCommand: async (command: SessionCommandRequest) => {
            switch (command.type) {
                case 'resume': {
                    const resumeResult = await sessionCommandService.executeSessionCommand({
                        type: 'resume',
                        sessionId: command.sessionId,
                        permissionMode: command.permissionMode,
                    })
                    const resume = resumeResult.ok
                        ? (resumeResult.resume ?? {
                              type: 'error' as const,
                              message: 'Session resume failed',
                              code: 'session_action_failed' as const,
                          })
                        : {
                              type: 'error' as const,
                              message: resumeResult.error.message,
                              code: resumeResult.error.code,
                          }
                    return resume.type === 'error'
                        ? {
                              ok: false as const,
                              command: command.type,
                              error: {
                                  message: resume.message,
                                  code: resume.code,
                                  status: getSessionCommandResumeStatus(resume.code),
                              },
                          }
                        : { ok: true as const, command: command.type, resume }
                }
                case 'abort':
                    abortSessionCalls.push(command.sessionId)
                    currentSession = options?.abortSessionResult ?? {
                        ...currentSession,
                        thinking: false,
                        thinkingAt: currentSession.updatedAt + 1,
                    }
                    return { ok: true as const, command: command.type, session: currentSession }
                case 'archive':
                    archiveSessionCalls.push(command.sessionId)
                    currentSession = {
                        ...currentSession,
                        active: false,
                        metadata: currentSession.metadata
                            ? {
                                  ...currentSession.metadata,
                                  lifecycleState: 'archived',
                                  lifecycleStateSince: currentSession.updatedAt + 1,
                              }
                            : null,
                    }
                    return { ok: true as const, command: command.type, session: currentSession }
                case 'close':
                    closeSessionCalls.push(command.sessionId)
                    currentSession = {
                        ...currentSession,
                        active: false,
                        metadata: currentSession.metadata
                            ? {
                                  ...currentSession.metadata,
                                  lifecycleState: 'closed',
                                  lifecycleStateSince: currentSession.updatedAt + 1,
                              }
                            : null,
                    }
                    return { ok: true as const, command: command.type, session: currentSession }
                case 'unarchive':
                    return {
                        ok: true as const,
                        command: command.type,
                        session: await (engine as SyncEngine).unarchiveSession(command.sessionId),
                    }
                case 'driver-switch': {
                    switchDriverCalls.push([command.sessionId, command.targetDriver])
                    const driverSwitch = options?.switchDriverResult ?? {
                        type: 'success' as const,
                        targetDriver: command.targetDriver,
                        session: {
                            ...currentSession,
                            metadata: currentSession.metadata
                                ? { ...currentSession.metadata, driver: command.targetDriver }
                                : null,
                            updatedAt: currentSession.updatedAt + 1,
                        },
                    }
                    if (driverSwitch.type === 'success') {
                        currentSession = driverSwitch.session
                    }
                    return driverSwitch.type === 'error'
                        ? {
                              ok: false as const,
                              command: command.type,
                              error: {
                                  message: driverSwitch.message,
                                  code: 'session_action_failed' as const,
                                  status: driverSwitch.status,
                              },
                              driverSwitch,
                          }
                        : { ok: true as const, command: command.type, session: driverSwitch.session, driverSwitch }
                }
                case 'permission-mode':
                case 'collaboration-mode':
                case 'model':
                case 'model-reasoning-effort':
                case 'codex-service-tier':
                    return await sessionCommandService.executeSessionCommand(command)
            }
        },
        unarchiveSession: async (sessionId: string) => {
            unarchiveSessionCalls.push(sessionId)
            currentSession = {
                ...currentSession,
                active: false,
                metadata: currentSession.metadata
                    ? {
                          ...currentSession.metadata,
                          lifecycleState: 'closed',
                          lifecycleStateSince: currentSession.updatedAt + 1,
                      }
                    : null,
            }
            return currentSession
        },
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.route(
        '/api',
        createSessionsRoutes(
            () => engine as SyncEngine,
            () => options?.stream ?? null
        )
    )
    app.route(
        '/api',
        createPermissionsRoutes(() => engine as SyncEngine)
    )

    return {
        app,
        abortSessionCalls,
        applySessionConfigCalls,
        approvePermissionCalls,
        archiveSessionCalls,
        closeSessionCalls,
        deleteSessionCalls,
        denyPermissionCalls,
        listCommandCapabilitiesCalls,
        recoveryCalls,
        resumeSessionCalls,
        switchDriverCalls,
        renameSessionCalls,
        unarchiveSessionCalls,
    }
}
