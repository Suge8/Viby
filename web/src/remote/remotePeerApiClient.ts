import type { QueryClient } from '@tanstack/react-query'
import { MACHINE_BROWSE_DIRECTORY_CAPABILITY, type PairingPeerSessionHeadResult } from '@viby/protocol'
import type { ApiClient } from '@/api/client'
import { type ApprovePermissionOptions, normalizeApprovePermissionBody } from '@/api/clientSessionSupport'
import { withAbortSignal } from '@/api/clientShared'
import { queryKeys } from '@/lib/query-keys'
import {
    writeSessionHeadToQueryCache,
    writeSessionsResponseToQueryCache,
    writeSessionViewToQueryCache,
} from '@/lib/sessionQueryCache'
import type {
    AgentFlavor,
    AttachmentMetadata,
    CodexCollaborationMode,
    CodexServiceTier,
    CommandCapabilitiesResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    ListAgentAvailabilityRequest,
    ListDirectoryResponse,
    LocalSessionExportRequest,
    MessagesResponse,
    ModelReasoningEffort,
    OpenAgentConfigRequest,
    PermissionMode,
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    RestoreAgentConfigRequest,
    RuntimeCapabilityRequest,
    RuntimeCapabilityResponse,
    RuntimeResponse,
    SaveAgentConfigRequest,
    Session,
    SessionRecoveryPage,
    SessionsResponse,
    SessionViewSnapshot,
} from '@/types/api'
import type { RemotePeerBridge } from './remotePairingBridgeTypes'
import {
    limitMessagesResponse,
    REMOTE_PAGE_LIMIT,
    toRecoveryPage,
    toSessionSummary,
} from './remotePeerApiClientMappers'

type RemoteApiOptions = {
    bridge: RemotePeerBridge
    queryClient: QueryClient
}

function writeSessions(queryClient: QueryClient, response: SessionsResponse): void {
    writeSessionsResponseToQueryCache(queryClient, response)
}

function isSessionViewSnapshot(
    value: PairingPeerSessionHeadResult | SessionViewSnapshot
): value is SessionViewSnapshot {
    return 'latestWindow' in value
}

function buildRemoteRuntimeResponse(): RuntimeResponse {
    return {
        runtime: {
            id: 'remote-p2p',
            active: true,
            metadata: {
                host: 'desktop',
                platform: globalThis.navigator?.platform || 'web',
                appCoreVersion: 'remote',
                displayName: 'Viby Desktop',
                capabilities: [MACHINE_BROWSE_DIRECTORY_CAPABILITY],
            },
        },
    }
}

export function createRemotePeerApiClient(options: RemoteApiOptions): ApiClient {
    const latestViews = new Map<string, SessionViewSnapshot>()
    const sessionHeads = new Map<string, PairingPeerSessionHeadResult>()
    const remoteRuntime = buildRemoteRuntimeResponse()
    options.queryClient.setQueryData(queryKeys.runtime, remoteRuntime)

    function rememberView(view: SessionViewSnapshot): SessionViewSnapshot {
        latestViews.set(view.session.id, view)
        sessionHeads.set(view.session.id, view)
        writeSessionViewToQueryCache(options.queryClient, view)
        return view
    }

    function rememberHead(head: PairingPeerSessionHeadResult): PairingPeerSessionHeadResult {
        latestViews.delete(head.session.id)
        sessionHeads.set(head.session.id, head)
        writeSessionHeadToQueryCache(options.queryClient, head)
        return head
    }

    async function openHead(sessionId: string): Promise<PairingPeerSessionHeadResult> {
        const result = await options.bridge.openSession({ sessionId, includeLatestWindow: false })
        return isSessionViewSnapshot(result) ? rememberView(result) : rememberHead(result)
    }

    async function openView(sessionId: string): Promise<SessionViewSnapshot> {
        const current = latestViews.get(sessionId)
        if (current) return current
        const head = sessionHeads.get(sessionId) ?? (await openHead(sessionId))
        if (isSessionViewSnapshot(head)) return head
        const latestWindow = await options.bridge.getMessages({ sessionId, beforeSeq: null, limit: REMOTE_PAGE_LIMIT })
        return rememberView({ ...head, latestWindow })
    }

    const client = {
        async getSessions(): Promise<SessionsResponse> {
            const response = await options.bridge.listSessions()
            const sessionsResponse = { sessions: response.sessions.map(toSessionSummary) }
            writeSessions(options.queryClient, sessionsResponse)
            return sessionsResponse
        },
        async getResumableSessions() {
            return {
                revision: 'remote',
                sessions: [],
                page: { cursor: null, nextCursor: null, limit: 0, hasMore: false },
            }
        },
        async getSession(sessionId: string): Promise<{ session: Session }> {
            const head = sessionHeads.get(sessionId) ?? latestViews.get(sessionId) ?? (await openHead(sessionId))
            return { session: head.session }
        },
        async getSessionView(sessionId: string): Promise<SessionViewSnapshot> {
            return await openView(sessionId)
        },
        async getMessages(
            sessionId: string,
            input: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
        ): Promise<MessagesResponse> {
            const limit = input.limit ?? REMOTE_PAGE_LIMIT
            if (typeof input.afterSeq === 'number') {
                const result = await options.bridge.loadAfter({ sessionId, afterSeq: input.afterSeq, limit })
                return {
                    messages: result.messages,
                    page: { limit, beforeSeq: null, nextBeforeSeq: null, hasMore: false },
                }
            }
            const cached = latestViews.get(sessionId)
            if (cached && (input.beforeSeq === undefined || input.beforeSeq === null)) {
                return limitMessagesResponse(cached.latestWindow, limit)
            }
            return await options.bridge.getMessages({ sessionId, beforeSeq: input.beforeSeq ?? null, limit })
        },
        async getSessionRecovery(
            sessionId: string,
            input: { afterSeq: number; limit?: number }
        ): Promise<SessionRecoveryPage> {
            const limit = input.limit ?? REMOTE_PAGE_LIMIT
            const result = await options.bridge.loadAfter({ sessionId, afterSeq: input.afterSeq, limit })
            const head = sessionHeads.get(sessionId) ?? latestViews.get(sessionId) ?? (await openHead(sessionId))
            return toRecoveryPage(head.session, result.messages, input.afterSeq, limit)
        },
        async resumeSession(sessionId: string): Promise<Session> {
            const result = await options.bridge.resumeSession({ sessionId, includeLatestWindow: false })
            if (isSessionViewSnapshot(result)) return rememberView(result).session
            return rememberHead(result).session
        },
        async sendMessage(
            sessionId: string,
            text: string,
            localId?: string | null,
            _attachments?: AttachmentMetadata[]
        ) {
            const response = await options.bridge.sendMessage({ sessionId, text, localId: localId ?? undefined })
            return { ok: true as const, session: response.session, message: response.message }
        },
        async abortSession(sessionId: string): Promise<Session> {
            return (await options.bridge.abortSession({ sessionId })).session
        },
        async archiveSession(sessionId: string): Promise<Session> {
            return (await options.bridge.archiveSession({ sessionId })).session
        },
        async closeSession(sessionId: string): Promise<Session> {
            return (await options.bridge.closeSession({ sessionId })).session
        },
        async unarchiveSession(sessionId: string): Promise<Session> {
            return (await options.bridge.unarchiveSession({ sessionId })).session
        },
        async switchSessionDriver(sessionId: string, targetDriver: AgentFlavor): Promise<Session> {
            return (await options.bridge.switchSessionDriver({ sessionId, targetDriver })).session
        },
        async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<Session> {
            return (await options.bridge.setPermissionMode({ sessionId, mode })).session
        },
        async setCollaborationMode(sessionId: string, mode: CodexCollaborationMode): Promise<Session> {
            return (await options.bridge.setCollaborationMode({ sessionId, mode })).session
        },
        async setModel(sessionId: string, model: string | null): Promise<Session> {
            return (await options.bridge.setModel({ sessionId, model })).session
        },
        async setModelReasoningEffort(
            sessionId: string,
            modelReasoningEffort: ModelReasoningEffort | null
        ): Promise<Session> {
            return (await options.bridge.setModelReasoningEffort({ sessionId, modelReasoningEffort })).session
        },
        async setCodexServiceTier(sessionId: string, codexServiceTier: CodexServiceTier | null): Promise<Session> {
            return (await options.bridge.setCodexServiceTier({ sessionId, codexServiceTier })).session
        },
        async approvePermission(
            sessionId: string,
            requestId: string,
            modeOrOptions?: ApprovePermissionOptions['mode'] | ApprovePermissionOptions
        ): Promise<void> {
            await options.bridge.approvePermission({
                sessionId,
                requestId,
                ...normalizeApprovePermissionBody(modeOrOptions),
            })
        },
        async denyPermission(
            sessionId: string,
            requestId: string,
            optionsInput?: { decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort' }
        ): Promise<void> {
            await options.bridge.denyPermission({ sessionId, requestId, decision: optionsInput?.decision })
        },
        async renameSession(sessionId: string, name: string): Promise<Session> {
            return (await options.bridge.renameSession({ sessionId, name })).session
        },
        async deleteSession(sessionId: string): Promise<void> {
            await options.bridge.deleteSession({ sessionId })
        },
        async getCommandCapabilities(_sessionId: string, revision?: string): Promise<CommandCapabilitiesResponse> {
            return await options.bridge.getCommandCapabilities({ sessionId: _sessionId, revision })
        },
        async getRuntime(): Promise<RuntimeResponse> {
            return remoteRuntime
        },
        async getRuntimeCapabilities(
            input?: RuntimeCapabilityRequest & { signal?: AbortSignal }
        ): Promise<RuntimeCapabilityResponse> {
            const request = input
                ? {
                      directory: input.directory,
                      forceRefresh: input.forceRefresh,
                      drivers: input.drivers,
                      depth: input.depth,
                  }
                : undefined
            return await withAbortSignal(options.bridge.getRuntimeCapabilities(request), input?.signal)
        },
        async getRuntimeAgentAvailability(input?: ListAgentAvailabilityRequest & { signal?: AbortSignal }) {
            return await withAbortSignal(
                options.bridge.getRuntimeAgentAvailability({
                    directory: input?.directory,
                    forceRefresh: input?.forceRefresh,
                    drivers: input?.drivers,
                }),
                input?.signal
            )
        },
        async getAgentConfig(input?: { signal?: AbortSignal }) {
            return await withAbortSignal(options.bridge.getAgentConfig(), input?.signal)
        },
        async saveAgentConfig(input: SaveAgentConfigRequest) {
            return await options.bridge.saveAgentConfig(input)
        },
        async restoreAgentConfig(input: RestoreAgentConfigRequest) {
            return await options.bridge.restoreAgentConfig(input)
        },
        async openAgentConfig(input: OpenAgentConfigRequest) {
            return await options.bridge.openAgentConfig(input)
        },
        async checkRuntimePathsExists(paths: string[]): Promise<{ exists: Record<string, boolean> }> {
            return await options.bridge.checkRuntimePathsExists({ paths })
        },
        async browseRuntimeDirectory(path?: string, browseOptions?: { workspaceRoot?: string | null }) {
            return await options.bridge.browseRuntimeDirectory(
                path || browseOptions?.workspaceRoot
                    ? { path, workspaceRoot: browseOptions?.workspaceRoot ?? undefined }
                    : undefined
            )
        },
        async resolveAgentLaunchConfig(input: { agent: AgentFlavor; directory: string; signal?: AbortSignal }) {
            const { signal, ...request } = input
            return await withAbortSignal(options.bridge.resolveAgentLaunchConfig(request), signal)
        },
        async listRuntimeLocalSessions(
            _path: string,
            driver: LocalSessionExportRequest['driver'],
            requestOptions?: { signal?: AbortSignal }
        ) {
            return await withAbortSignal(
                options.bridge.listRuntimeLocalSessions({ path: _path, driver }),
                requestOptions?.signal
            )
        },
        async importRuntimeLocalSession(input: LocalSessionExportRequest) {
            return await options.bridge.importRuntimeLocalSession(input)
        },
        async spawnSession(_input: {
            directory: string
            agent?: AgentFlavor
            model?: string
            modelReasoningEffort?: ModelReasoningEffort
            codexServiceTier?: CodexServiceTier
            permissionMode?: PermissionMode
            sessionType?: 'simple' | 'worktree'
            worktreeName?: string
            collaborationMode?: CodexCollaborationMode
        }) {
            return await options.bridge.spawnSession(_input)
        },
        async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
            return await options.bridge.getGitStatus({ sessionId })
        },
        async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
            return await options.bridge.getGitDiffNumstat({ sessionId, staged })
        },
        async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
            return await options.bridge.getGitDiffFile({ sessionId, path, staged })
        },
        async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
            return await options.bridge.searchSessionFiles({ sessionId, query, limit })
        },
        async readSessionFile(sessionId: string, path: string): Promise<FileReadResponse> {
            return await options.bridge.readSessionFile({ sessionId, path })
        },
        async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
            return await options.bridge.listSessionDirectory({ sessionId, path })
        },
        async uploadFile(sessionId: string, file: File, mimeType: string) {
            return await options.bridge.uploadFile(sessionId, file, mimeType)
        },
        async deleteUploadFile(sessionId: string, path: string): Promise<{ success: boolean; error?: string }> {
            return await options.bridge.deleteUploadFile({ sessionId, path })
        },
        async getPushVapidPublicKey(): Promise<{ publicKey: string }> {
            return await options.bridge.getPushVapidPublicKey()
        },
        async subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void> {
            await options.bridge.subscribePushNotifications(payload)
        },
        async unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void> {
            await options.bridge.unsubscribePushNotifications(payload)
        },
    }

    return client as unknown as ApiClient
}
