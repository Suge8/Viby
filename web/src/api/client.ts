import type {
    AttachmentMetadata,
    CodexCollaborationMode,
    DeleteUploadResponse,
    ListDirectoryResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    MachineBrowseDirectoryResponse,
    MachinePathsExistsResponse,
    MachinesResponse,
    MessagesResponse,
    PermissionMode,
    PushSubscriptionPayload,
    SessionRecoveryPage,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
    SlashCommandsResponse,
    SkillsResponse,
    SpawnResponse,
    TeamProjectSnapshot,
    TeamSessionSpawnRole,
    UploadFileResponse,
    ModelReasoningEffort,
    Session,
    SessionResponse,
    SessionsResponse
} from '@/types/api'
import { ApiError, buildApiUrl, parseErrorPayload } from './clientShared'
export { ApiError } from './clientShared'

type ApiClientOptions = {
    baseUrl?: string
    getToken?: () => string | null
    onUnauthorized?: () => Promise<string | null>
}

type SessionActionResponse = {
    ok: true
    session: Session
}

type ResumeSessionResponse = {
    type: 'success'
    session: Session
}

type SessionActionLegacyResponse = {
    ok: true
}

type ResumeSessionLegacyResponse = {
    type: 'success'
    sessionId: string
}

type SessionSnapshotAction =
    | 'archive'
    | 'close'
    | 'unarchive'
    | 'permission-mode'
    | 'collaboration-mode'
    | 'model'
    | 'model-reasoning-effort'

function createCachedModuleLoader<TModule>(
    load: () => Promise<TModule>
): () => Promise<TModule> {
    let modulePromise: Promise<TModule> | null = null

    return function loadCachedModule(): Promise<TModule> {
        modulePromise ??= load()
        return modulePromise
    }
}

export type ApiClientRequest = <T>(path: string, init?: RequestInit) => Promise<T>
export type ApiClientFetchSessionSnapshot = (sessionId: string) => Promise<Session>

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isSession(value: unknown): value is Session {
    return isRecord(value) && typeof value.id === 'string'
}

function isResumeSessionResponse(value: unknown): value is ResumeSessionResponse {
    return isRecord(value) && value.type === 'success' && isSession(value.session)
}

function isResumeSessionLegacyResponse(value: unknown): value is ResumeSessionLegacyResponse {
    return isRecord(value) && value.type === 'success' && typeof value.sessionId === 'string'
}

function isSessionActionResponse(value: unknown): value is SessionActionResponse {
    return isRecord(value) && value.ok === true && isSession(value.session)
}

function isSessionActionLegacyResponse(value: unknown): value is SessionActionLegacyResponse {
    return isRecord(value) && value.ok === true
}

const loadPushModule = createCachedModuleLoader(() => import('./clientPush'))
const loadWorkspaceModule = createCachedModuleLoader(() => import('./clientWorkspace'))
const loadMachinesModule = createCachedModuleLoader(() => import('./clientMachines'))
const loadAutocompleteModule = createCachedModuleLoader(() => import('./clientAutocomplete'))
const loadTeamsModule = createCachedModuleLoader(() => import('./clientTeams'))

export class ApiClient {
    private token: string
    private readonly baseUrl: string | null
    private readonly getToken: (() => string | null) | null
    private readonly onUnauthorized: (() => Promise<string | null>) | null
    private readonly boundRequest: ApiClientRequest
    private readonly boundFetchSessionSnapshot: ApiClientFetchSessionSnapshot

    constructor(token: string, options?: ApiClientOptions) {
        this.token = token
        this.baseUrl = options?.baseUrl ?? null
        this.getToken = options?.getToken ?? null
        this.onUnauthorized = options?.onUnauthorized ?? null
        this.boundRequest = this.request.bind(this)
        this.boundFetchSessionSnapshot = this.fetchSessionSnapshot.bind(this)
    }

    private buildUrl(path: string): string {
        return buildApiUrl(this.baseUrl, path)
    }

    private async request<T>(
        path: string,
        init?: RequestInit,
        attempt: number = 0,
        overrideToken?: string | null
    ): Promise<T> {
        const headers = new Headers(init?.headers)
        const liveToken = this.getToken ? this.getToken() : null
        const authToken = overrideToken !== undefined
            ? (overrideToken ?? (liveToken ?? this.token))
            : (liveToken ?? this.token)
        if (authToken) {
            headers.set('authorization', `Bearer ${authToken}`)
        }
        if (init?.body !== undefined && !headers.has('content-type')) {
            headers.set('content-type', 'application/json')
        }

        const res = await fetch(this.buildUrl(path), {
            ...init,
            headers
        })

        if (res.status === 401) {
            if (attempt === 0 && this.onUnauthorized) {
                const refreshed = await this.onUnauthorized()
                if (refreshed) {
                    this.token = refreshed
                    return await this.request<T>(path, init, attempt + 1, refreshed)
                }
            }
            throw new Error('Session expired. Please sign in again.')
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const parsed = parseErrorPayload(body)
            const detail = parsed.message ? `: ${parsed.message}` : body ? `: ${body}` : ''
            throw new ApiError(`HTTP ${res.status} ${res.statusText}${detail}`, res.status, parsed.code, body || undefined)
        }

        return await res.json() as T
    }

    private async fetchSessionSnapshot(sessionId: string): Promise<Session> {
        return (await this.getSession(sessionId)).session
    }

    private async resolveSessionActionSnapshotResponse(
        response: unknown,
        sessionId: string,
        action: string
    ): Promise<Session> {
        if (isSessionActionResponse(response)) {
            return response.session
        }
        if (isSessionActionLegacyResponse(response)) {
            return await this.fetchSessionSnapshot(sessionId)
        }

        throw new Error(`Invalid session action response for ${action}`)
    }

    async getSessions(): Promise<SessionsResponse> {
        return await this.request<SessionsResponse>('/api/sessions')
    }

    async getPushVapidPublicKey(): Promise<PushVapidPublicKeyResponse> {
        const module = await loadPushModule()
        return await module.getPushVapidPublicKey(this.boundRequest)
    }

    async subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void> {
        const module = await loadPushModule()
        await module.subscribePushNotifications(this.boundRequest, payload)
    }

    async unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void> {
        const module = await loadPushModule()
        await module.unsubscribePushNotifications(this.boundRequest, payload)
    }

    async getSession(sessionId: string): Promise<SessionResponse> {
        return await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
    }

    async getMessages(sessionId: string, options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }): Promise<MessagesResponse> {
        const params = new URLSearchParams()
        if (options.beforeSeq !== undefined && options.beforeSeq !== null) {
            params.set('beforeSeq', `${options.beforeSeq}`)
        }
        if (options.afterSeq !== undefined && options.afterSeq !== null) {
            params.set('afterSeq', `${options.afterSeq}`)
        }
        if (options.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        const qs = params.toString()
        const url = `/api/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ''}`
        return await this.request<MessagesResponse>(url)
    }

    async getSessionRecovery(sessionId: string, options: { afterSeq: number; limit?: number }): Promise<SessionRecoveryPage> {
        const params = new URLSearchParams()
        params.set('afterSeq', `${options.afterSeq}`)
        if (options.limit !== undefined && options.limit !== null) {
            params.set('limit', `${options.limit}`)
        }

        return await this.request<SessionRecoveryPage>(
            `/api/sessions/${encodeURIComponent(sessionId)}/recovery?${params.toString()}`
        )
    }

    async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
        const module = await loadWorkspaceModule()
        return await module.getGitStatus(this.boundRequest, sessionId)
    }

    async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
        const module = await loadWorkspaceModule()
        return await module.getGitDiffNumstat(this.boundRequest, sessionId, staged)
    }

    async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
        const module = await loadWorkspaceModule()
        return await module.getGitDiffFile(this.boundRequest, sessionId, path, staged)
    }

    async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
        const module = await loadWorkspaceModule()
        return await module.searchSessionFiles(this.boundRequest, sessionId, query, limit)
    }

    async readSessionFile(sessionId: string, path: string): Promise<FileReadResponse> {
        const module = await loadWorkspaceModule()
        return await module.readSessionFile(this.boundRequest, sessionId, path)
    }

    async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
        const module = await loadWorkspaceModule()
        return await module.listSessionDirectory(this.boundRequest, sessionId, path)
    }

    async uploadFile(sessionId: string, filename: string, content: string, mimeType: string): Promise<UploadFileResponse> {
        const module = await loadWorkspaceModule()
        return await module.uploadFile(this.boundRequest, sessionId, filename, content, mimeType)
    }

    async deleteUploadFile(sessionId: string, path: string): Promise<DeleteUploadResponse> {
        const module = await loadWorkspaceModule()
        return await module.deleteUploadFile(this.boundRequest, sessionId, path)
    }

    async resumeSession(sessionId: string): Promise<Session> {
        const response = await this.request<unknown>(
            `/api/sessions/${encodeURIComponent(sessionId)}/resume`,
            { method: 'POST' }
        )
        if (isResumeSessionResponse(response)) {
            return response.session
        }
        if (isResumeSessionLegacyResponse(response)) {
            return await this.fetchSessionSnapshot(response.sessionId)
        }

        throw new Error('Invalid resume session response')
    }

    async sendMessage(sessionId: string, text: string, localId?: string | null, attachments?: AttachmentMetadata[]): Promise<Session> {
        const response = await this.request<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                text,
                localId: localId ?? undefined,
                attachments: attachments ?? undefined
            })
        })

        if (isSessionActionResponse(response)) {
            return response.session
        }
        if (isSessionActionLegacyResponse(response)) {
            return await this.fetchSessionSnapshot(sessionId)
        }

        throw new Error('Invalid send message response')
    }

    async abortSession(sessionId: string): Promise<Session> {
        const response = await this.request<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
            method: 'POST',
            body: JSON.stringify({})
        })

        return await this.resolveSessionActionSnapshotResponse(response, sessionId, 'abort')
    }

    async archiveSession(sessionId: string): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'archive', {})
    }

    async closeSession(sessionId: string): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'close', {})
    }

    async unarchiveSession(sessionId: string): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'unarchive', {})
    }

    async switchSession(sessionId: string): Promise<Session> {
        const response = await this.request<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/switch`, {
            method: 'POST',
            body: JSON.stringify({})
        })

        return await this.resolveSessionActionSnapshotResponse(response, sessionId, 'switch')
    }

    async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'permission-mode', { mode })
    }

    async setCollaborationMode(sessionId: string, mode: CodexCollaborationMode): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'collaboration-mode', { mode })
    }

    async setModel(sessionId: string, model: string | null): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'model', { model })
    }

    async setModelReasoningEffort(sessionId: string, modelReasoningEffort: ModelReasoningEffort | null): Promise<Session> {
        return await this.postSessionSnapshotAction(sessionId, 'model-reasoning-effort', { modelReasoningEffort })
    }

    async approvePermission(
        sessionId: string,
        requestId: string,
        modeOrOptions?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | {
            mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
            allowTools?: string[]
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            answers?: Record<string, string[]> | Record<string, { answers: string[] }>
        }
    ): Promise<void> {
        const body = typeof modeOrOptions === 'string' || modeOrOptions === undefined
            ? { mode: modeOrOptions }
            : modeOrOptions
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`, {
            method: 'POST',
            body: JSON.stringify(body)
        })
    }

    async denyPermission(
        sessionId: string,
        requestId: string,
        options?: {
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        }
    ): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`, {
            method: 'POST',
            body: JSON.stringify(options ?? {})
        })
    }

    async getMachines(): Promise<MachinesResponse> {
        const module = await loadMachinesModule()
        return await module.getMachines(this.boundRequest)
    }

    async getTeamProject(projectId: string): Promise<TeamProjectSnapshot> {
        const module = await loadTeamsModule()
        return await module.getTeamProject(this.boundRequest, projectId)
    }

    async interjectTeamMember(
        memberId: string,
        input: {
            text: string
            localId?: string | null
        }
    ): Promise<Session> {
        const module = await loadTeamsModule()
        return await module.interjectTeamMember(this.boundRequest, memberId, input)
    }

    async takeOverTeamMember(memberId: string): Promise<Session> {
        const module = await loadTeamsModule()
        return await module.takeOverTeamMember(this.boundRequest, memberId)
    }

    async returnTeamMember(memberId: string): Promise<Session> {
        const module = await loadTeamsModule()
        return await module.returnTeamMember(this.boundRequest, memberId)
    }

    async checkMachinePathsExists(
        machineId: string,
        paths: string[]
    ): Promise<MachinePathsExistsResponse> {
        const module = await loadMachinesModule()
        return await module.checkMachinePathsExists(this.boundRequest, machineId, paths)
    }

    async browseMachineDirectory(
        machineId: string,
        path?: string
    ): Promise<MachineBrowseDirectoryResponse> {
        const module = await loadMachinesModule()
        return await module.browseMachineDirectory(this.boundRequest, machineId, path)
    }

    async spawnSession(input: {
        machineId: string
        directory: string
        agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
        model?: string
        modelReasoningEffort?: ModelReasoningEffort
        permissionMode?: PermissionMode
        sessionRole?: TeamSessionSpawnRole
        sessionType?: 'simple' | 'worktree'
        worktreeName?: string
        collaborationMode?: CodexCollaborationMode
    }): Promise<SpawnResponse> {
        const module = await loadMachinesModule()
        return await module.spawnSession(this.boundRequest, this.boundFetchSessionSnapshot, input)
    }

    async getSlashCommands(sessionId: string): Promise<SlashCommandsResponse> {
        const module = await loadAutocompleteModule()
        return await module.getSlashCommands(this.boundRequest, sessionId)
    }

    async getSkills(sessionId: string): Promise<SkillsResponse> {
        const module = await loadAutocompleteModule()
        return await module.getSkills(this.boundRequest, sessionId)
    }

    async renameSession(sessionId: string, name: string): Promise<Session> {
        const response = await this.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ name })
        })
        return response.session
    }

    async deleteSession(sessionId: string): Promise<void> {
        await this.request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE'
        })
    }

    private async postSessionSnapshotAction(
        sessionId: string,
        action: SessionSnapshotAction,
        body: Record<string, unknown>
    ): Promise<Session> {
        const response = await this.request<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/${action}`, {
            method: 'POST',
            body: JSON.stringify(body)
        })
        return await this.resolveSessionActionSnapshotResponse(response, sessionId, action)
    }
}
