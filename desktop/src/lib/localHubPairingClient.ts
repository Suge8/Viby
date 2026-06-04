import type {
    PairingPeerMessagesParams,
    PairingPeerMessagesResult,
    PairingPeerPushSubscriptionParams,
    PairingPeerPushUnsubscribeParams,
    PairingPeerSendMessageResult,
    PairingPeerSpawnSessionParams,
    PairingPeerSpawnSessionResult,
    PairingPeerTerminalEventPayload,
    PairingPeerUploadCompleteParams,
    PairingPeerUploadResult,
    PairingPeerUploadStartParams,
} from '@viby/protocol/pairing'
import type {
    AgentAvailabilityResponse,
    AgentConfigResponse,
    CodexCollaborationMode,
    CodexServiceTier,
    CommandCapabilitiesResponse,
    DecryptedMessage,
    ListAgentAvailabilityRequest,
    LocalSessionCatalog,
    LocalSessionExportRequest,
    MachineDirectoryResponse,
    ModelReasoningEffort,
    OpenAgentConfigRequest,
    OpenAgentConfigResponse,
    PermissionMode,
    ResolveAgentLaunchConfigRequest,
    ResolveAgentLaunchConfigResponse,
    RestoreAgentConfigRequest,
    RestoreAgentConfigResponse,
    RuntimeCapabilityRequest,
    RuntimeCapabilityResponse,
    SaveAgentConfigRequest,
    SaveAgentConfigResponse,
    Session,
    SessionSummary,
    SessionViewSnapshot,
} from '@viby/protocol/types'
import { LocalHubPairingClientCore, type LocalHubPairingClientOptions } from './localHubPairingClientCore'
import type { LocalHubPairingRequestJson } from './localHubPairingRequest'
import {
    browseRuntimeDirectory,
    checkRuntimePathsExists,
    getAgentConfig,
    getRuntimeAgentAvailability,
    getRuntimeCapabilities,
    importRuntimeLocalSession,
    listRuntimeLocalSessions,
    openAgentConfig,
    resolveAgentLaunchConfig,
    restoreAgentConfig,
    saveAgentConfig,
} from './localHubPairingRuntimeClient'
import {
    approvePermission,
    deleteSession,
    denyPermission,
    getCommandCapabilities,
    postSessionAction,
    renameSession,
    setCodexServiceTier,
    setCollaborationMode,
    setModel,
    setModelReasoningEffort,
    setPermissionMode,
    switchSessionDriver,
} from './localHubPairingSessionClient'
import { LocalHubPairingTerminalClient } from './localHubPairingTerminalClient'
import {
    type FileReadResponse,
    type FileSearchResponse,
    type GitCommandResponse,
    getGitDiffFile,
    getGitDiffNumstat,
    getGitStatus,
    type ListDirectoryResponse,
    listSessionDirectory,
    readSessionFile,
    searchSessionFiles,
} from './localHubPairingWorkspaceClient'
import { PairingBinaryUploadManager } from './pairingBinaryUpload'
export class LocalHubPairingClient extends LocalHubPairingClientCore {
    private readonly terminalClient: LocalHubPairingTerminalClient
    private readonly uploadManager = new PairingBinaryUploadManager()
    private readonly request: LocalHubPairingRequestJson = this.requestJson.bind(this)
    constructor(options: LocalHubPairingClientOptions) {
        super(options)
        this.terminalClient = new LocalHubPairingTerminalClient({
            baseUrl: this.baseUrl,
            authenticate: () => this.authenticate(),
        })
    }
    async listSessions(): Promise<SessionSummary[]> {
        const response = await this.requestJson<{ sessions: SessionSummary[] }>('/api/sessions')
        return response.sessions
    }
    async openSession(sessionId: string): Promise<SessionViewSnapshot> {
        return await this.requestJson<SessionViewSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/view`)
    }
    async resumeSession(sessionId: string): Promise<SessionViewSnapshot> {
        await this.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
            method: 'POST',
        })
        return await this.openSession(sessionId)
    }
    async getMessages(sessionId: string, options: PairingPeerMessagesParams): Promise<PairingPeerMessagesResult> {
        const params = new URLSearchParams()
        if (typeof options.beforeSeq === 'number') params.set('beforeSeq', `${options.beforeSeq}`)
        if (typeof options.afterSeq === 'number') params.set('afterSeq', `${options.afterSeq}`)
        if (typeof options.limit === 'number') params.set('limit', `${options.limit}`)
        const query = params.toString()
        return await this.requestJson<PairingPeerMessagesResult>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages${query ? `?${query}` : ''}`
        )
    }

    async loadMessagesAfter(
        sessionId: string,
        afterSeq: number,
        limit: number
    ): Promise<{
        messages: DecryptedMessage[]
        nextAfterSeq: number
    }> {
        const response = await this.requestJson<{ messages: DecryptedMessage[] }>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages?afterSeq=${afterSeq}&limit=${limit}`
        )
        const nextAfterSeq = response.messages.reduce((cursor, message) => {
            return typeof message.seq === 'number' && message.seq > cursor ? message.seq : cursor
        }, afterSeq)
        return {
            messages: response.messages,
            nextAfterSeq,
        }
    }
    async sendMessage(sessionId: string, text: string, localId?: string): Promise<PairingPeerSendMessageResult> {
        return await this.requestJson<PairingPeerSendMessageResult>(
            `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
            {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    ...(localId ? { localId } : {}),
                }),
            }
        )
    }
    async abortSession(sessionId: string): Promise<Session> {
        return await postSessionAction(this.request, sessionId, 'abort', {})
    }
    async archiveSession(sessionId: string): Promise<Session> {
        return await postSessionAction(this.request, sessionId, 'archive', {})
    }
    async closeSession(sessionId: string): Promise<Session> {
        return await postSessionAction(this.request, sessionId, 'close', {})
    }
    async unarchiveSession(sessionId: string): Promise<Session> {
        return await postSessionAction(this.request, sessionId, 'unarchive', {})
    }
    async renameSession(sessionId: string, name: string): Promise<Session> {
        return await renameSession(this.request, sessionId, name)
    }
    async deleteSession(sessionId: string): Promise<void> {
        await deleteSession(this.request, sessionId)
    }
    async switchSessionDriver(sessionId: string, targetDriver: string): Promise<Session> {
        return await switchSessionDriver(this.request, sessionId, targetDriver)
    }
    async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<Session> {
        return await setPermissionMode(this.request, sessionId, mode)
    }
    async setCollaborationMode(sessionId: string, mode: CodexCollaborationMode): Promise<Session> {
        return await setCollaborationMode(this.request, sessionId, mode)
    }
    async setModel(sessionId: string, model: string | null): Promise<Session> {
        return await setModel(this.request, sessionId, model)
    }
    async setModelReasoningEffort(
        sessionId: string,
        modelReasoningEffort: ModelReasoningEffort | null
    ): Promise<Session> {
        return await setModelReasoningEffort(this.request, sessionId, modelReasoningEffort)
    }
    async setCodexServiceTier(sessionId: string, codexServiceTier: CodexServiceTier | null): Promise<Session> {
        return await setCodexServiceTier(this.request, sessionId, codexServiceTier)
    }
    async approvePermission(
        sessionId: string,
        requestId: string,
        body: {
            mode?: PermissionMode
            allowTools?: string[]
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            answers?: unknown
        }
    ): Promise<void> {
        await approvePermission(this.request, sessionId, requestId, body)
    }
    async denyPermission(
        sessionId: string,
        requestId: string,
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
    ): Promise<void> {
        await denyPermission(this.request, sessionId, requestId, decision)
    }
    async getCommandCapabilities(sessionId: string, revision?: string): Promise<CommandCapabilitiesResponse> {
        return await getCommandCapabilities(this.request, sessionId, revision)
    }
    async getRuntimeCapabilities(input: RuntimeCapabilityRequest): Promise<RuntimeCapabilityResponse> {
        return await getRuntimeCapabilities(this.request, input)
    }
    async getRuntimeAgentAvailability(input: ListAgentAvailabilityRequest = {}): Promise<AgentAvailabilityResponse> {
        return await getRuntimeAgentAvailability(this.request, input)
    }
    async getAgentConfig(): Promise<AgentConfigResponse> {
        return await getAgentConfig(this.request)
    }
    async saveAgentConfig(input: SaveAgentConfigRequest): Promise<SaveAgentConfigResponse> {
        return await saveAgentConfig(this.request, input)
    }
    async restoreAgentConfig(input: RestoreAgentConfigRequest): Promise<RestoreAgentConfigResponse> {
        return await restoreAgentConfig(this.request, input)
    }
    async openAgentConfig(input: OpenAgentConfigRequest): Promise<OpenAgentConfigResponse> {
        return await openAgentConfig(this.request, input)
    }
    async checkRuntimePathsExists(paths: string[]): Promise<{ exists: Record<string, boolean> }> {
        return await checkRuntimePathsExists(this.request, paths)
    }
    async browseRuntimeDirectory(path?: string): Promise<MachineDirectoryResponse> {
        return await browseRuntimeDirectory(this.request, path)
    }
    async resolveAgentLaunchConfig(input: ResolveAgentLaunchConfigRequest): Promise<ResolveAgentLaunchConfigResponse> {
        return await resolveAgentLaunchConfig(this.request, input)
    }
    async listRuntimeLocalSessions(
        path: string,
        driver: LocalSessionExportRequest['driver']
    ): Promise<LocalSessionCatalog> {
        return await listRuntimeLocalSessions(this.request, path, driver)
    }
    async importRuntimeLocalSession(
        input: LocalSessionExportRequest
    ): Promise<{ session: Session; imported: boolean }> {
        return await importRuntimeLocalSession(this.request, input)
    }
    async spawnSession(input: PairingPeerSpawnSessionParams): Promise<PairingPeerSpawnSessionResult> {
        return await this.requestJson<PairingPeerSpawnSessionResult>('/api/runtime/spawn', {
            method: 'POST',
            body: JSON.stringify(input),
        })
    }
    async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
        return await getGitStatus(this.request, sessionId)
    }
    async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
        return await getGitDiffNumstat(this.request, sessionId, staged)
    }
    async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
        return await getGitDiffFile(this.request, sessionId, path, staged)
    }
    async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
        return await searchSessionFiles(this.request, sessionId, query, limit)
    }
    async readSessionFile(sessionId: string, path: string): Promise<FileReadResponse> {
        return await readSessionFile(this.request, sessionId, path)
    }
    async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
        return await listSessionDirectory(this.request, sessionId, path)
    }
    async deleteUploadFile(sessionId: string, path: string): Promise<{ success: boolean; error?: string }> {
        return await this.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/upload/delete`, {
            method: 'POST',
            body: JSON.stringify({ path }),
        })
    }
    async uploadFile(
        sessionId: string,
        file: Blob,
        filename: string,
        mimeType: string
    ): Promise<PairingPeerUploadResult> {
        const formData = new FormData()
        formData.append('file', file, filename)
        formData.append('mimeType', mimeType)
        return await this.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
            method: 'POST',
            body: formData,
        })
    }
    beginUpload(params: PairingPeerUploadStartParams): void {
        this.uploadManager.begin(params)
    }
    cancelUpload(transferId: string): void {
        this.uploadManager.cancel(transferId)
    }
    async acceptUploadChunk(data: unknown): Promise<boolean> {
        return await this.uploadManager.accept(data)
    }
    async completeUpload(params: PairingPeerUploadCompleteParams): Promise<PairingPeerUploadResult> {
        return await this.uploadManager.complete(
            params,
            async (file, filename, mimeType) => await this.uploadFile(params.sessionId, file, filename, mimeType)
        )
    }
    async getPushVapidPublicKey(): Promise<{ publicKey: string }> {
        return await this.requestJson('/api/push/vapid-public-key')
    }
    async subscribePushNotifications(params: PairingPeerPushSubscriptionParams): Promise<void> {
        await this.requestJson('/api/push/subscribe', { method: 'POST', body: JSON.stringify(params) })
    }
    async unsubscribePushNotifications(params: PairingPeerPushUnsubscribeParams): Promise<void> {
        await this.requestJson('/api/push/subscribe', { method: 'DELETE', body: JSON.stringify(params) })
    }
    async openTerminal(
        params: { sessionId: string; terminalId: string; cols: number; rows: number },
        emit: (payload: PairingPeerTerminalEventPayload) => void
    ): Promise<void> {
        await this.terminalClient.open(params, emit)
    }
    writeTerminal(sessionId: string, terminalId: string, data: string): void {
        this.terminalClient.write(sessionId, terminalId, data)
    }
    resizeTerminal(sessionId: string, terminalId: string, cols: number, rows: number): void {
        this.terminalClient.resize(sessionId, terminalId, cols, rows)
    }
    closeTerminal(_sessionId: string, terminalId: string): void {
        this.terminalClient.close(terminalId)
    }
    closeAllTerminals(): void {
        this.terminalClient.closeAll()
    }
}
