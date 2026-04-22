import { assertSameSessionSwitchTargetDriver, type SameSessionSwitchTargetDriver } from '@viby/protocol'
import type {
    AttachmentMetadata,
    CodexCollaborationMode,
    MessagesResponse,
    ModelReasoningEffort,
    PermissionMode,
    ResumableSessionsResponse,
    Session,
    SessionRecoveryPage,
    SessionResponse,
    SessionsResponse,
    SessionViewSnapshot,
} from '@/types/api'
import type {
    ApiClientFetchSessionSnapshot,
    ApiClientRequest,
    ApiClientResolveSessionActionSnapshotResponse,
    ApiClientUnknownRequest,
} from './client'
import {
    type ApprovePermissionOptions,
    isDriverSwitchResponse,
    isResumeSessionLegacyResponse,
    isResumeSessionResponse,
    isSessionActionLegacyResponse,
    isSessionActionResponse,
    normalizeApprovePermissionBody,
    type SessionSnapshotAction,
} from './clientSessionSupport'

export function createApiClientSessionMethods(core: {
    request: ApiClientRequest
    requestUnknown: ApiClientUnknownRequest
    fetchSessionSnapshot: ApiClientFetchSessionSnapshot
    resolveSessionActionSnapshotResponse: ApiClientResolveSessionActionSnapshotResponse
}) {
    return {
        async getSessions(): Promise<SessionsResponse> {
            return await core.request<SessionsResponse>('/api/sessions')
        },

        async getResumableSessions(
            options?: {
                driver?: string | null
                query?: string | null
                lifecycle?: 'closed' | 'all'
                cursor?: string | null
                limit?: number | null
            },
            revision?: string
        ): Promise<ResumableSessionsResponse> {
            const params = new URLSearchParams()
            if (options?.driver) {
                params.set('driver', options.driver)
            }
            if (options?.query && options.query.trim().length > 0) {
                params.set('query', options.query.trim())
            }
            if (options?.lifecycle && options.lifecycle !== 'closed') {
                params.set('lifecycle', options.lifecycle)
            }
            if (options?.cursor) {
                params.set('cursor', options.cursor)
            }
            if (typeof options?.limit === 'number' && Number.isFinite(options.limit)) {
                params.set('limit', `${options.limit}`)
            }
            if (revision) {
                params.set('revision', revision)
            }

            const query = params.toString()
            return await core.request<ResumableSessionsResponse>(`/api/sessions/resumable${query ? `?${query}` : ''}`)
        },

        async getSession(sessionId: string): Promise<SessionResponse> {
            return await core.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`)
        },

        async getSessionView(
            sessionId: string,
            options?: Readonly<Pick<RequestInit, 'signal'>>
        ): Promise<SessionViewSnapshot> {
            return await core.request<SessionViewSnapshot>(`/api/sessions/${encodeURIComponent(sessionId)}/view`, {
                signal: options?.signal,
            })
        },

        async getMessages(
            sessionId: string,
            options: { beforeSeq?: number | null; afterSeq?: number | null; limit?: number }
        ): Promise<MessagesResponse> {
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

            const queryString = params.toString()
            return await core.request<MessagesResponse>(
                `/api/sessions/${encodeURIComponent(sessionId)}/messages${queryString ? `?${queryString}` : ''}`
            )
        },

        async getSessionRecovery(
            sessionId: string,
            options: { afterSeq: number; limit?: number }
        ): Promise<SessionRecoveryPage> {
            const params = new URLSearchParams()
            params.set('afterSeq', `${options.afterSeq}`)
            if (options.limit !== undefined && options.limit !== null) {
                params.set('limit', `${options.limit}`)
            }

            return await core.request<SessionRecoveryPage>(
                `/api/sessions/${encodeURIComponent(sessionId)}/recovery?${params.toString()}`
            )
        },

        async resumeSession(sessionId: string): Promise<Session> {
            const response = await core.requestUnknown(`/api/sessions/${encodeURIComponent(sessionId)}/resume`, {
                method: 'POST',
            })
            if (isResumeSessionResponse(response)) {
                return response.session
            }
            if (isResumeSessionLegacyResponse(response)) {
                return await core.fetchSessionSnapshot(response.sessionId)
            }

            throw new Error('Invalid resume session response')
        },

        async sendMessage(
            sessionId: string,
            text: string,
            localId?: string | null,
            attachments?: AttachmentMetadata[]
        ): Promise<Session> {
            const response = await core.requestUnknown(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
                method: 'POST',
                body: JSON.stringify({
                    text,
                    localId: localId ?? undefined,
                    attachments: attachments ?? undefined,
                }),
            })

            if (isSessionActionResponse(response)) {
                return response.session
            }
            if (isSessionActionLegacyResponse(response)) {
                return await core.fetchSessionSnapshot(sessionId)
            }

            throw new Error('Invalid send message response')
        },

        async abortSession(sessionId: string): Promise<Session> {
            const response = await core.requestUnknown(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
                method: 'POST',
                body: JSON.stringify({}),
            })
            return await core.resolveSessionActionSnapshotResponse(response, sessionId, 'abort')
        },

        async archiveSession(sessionId: string): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'archive', {})
        },

        async closeSession(sessionId: string): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'close', {})
        },

        async unarchiveSession(sessionId: string): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'unarchive', {})
        },

        async switchSessionDriver(sessionId: string, targetDriver: SameSessionSwitchTargetDriver): Promise<Session> {
            const validatedTargetDriver = assertSameSessionSwitchTargetDriver(targetDriver)
            const response = await core.requestUnknown(`/api/sessions/${encodeURIComponent(sessionId)}/driver-switch`, {
                method: 'POST',
                body: JSON.stringify({ targetDriver: validatedTargetDriver }),
            })

            if (!isDriverSwitchResponse(response)) {
                throw new Error('Invalid driver switch response')
            }

            return response.session
        },

        async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'permission-mode', { mode })
        },

        async setCollaborationMode(sessionId: string, mode: CodexCollaborationMode): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'collaboration-mode', { mode })
        },

        async setModel(sessionId: string, model: string | null): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'model', { model })
        },

        async setModelReasoningEffort(
            sessionId: string,
            modelReasoningEffort: ModelReasoningEffort | null
        ): Promise<Session> {
            return await postSessionSnapshotAction(core, sessionId, 'model-reasoning-effort', {
                modelReasoningEffort,
            })
        },

        async approvePermission(
            sessionId: string,
            requestId: string,
            modeOrOptions?: ApprovePermissionOptions['mode'] | ApprovePermissionOptions
        ): Promise<void> {
            await core.request(
                `/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`,
                {
                    method: 'POST',
                    body: JSON.stringify(normalizeApprovePermissionBody(modeOrOptions)),
                }
            )
        },

        async denyPermission(
            sessionId: string,
            requestId: string,
            options?: {
                decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
            }
        ): Promise<void> {
            await core.request(
                `/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`,
                {
                    method: 'POST',
                    body: JSON.stringify(options ?? {}),
                }
            )
        },

        async renameSession(sessionId: string, name: string): Promise<Session> {
            const response = await core.request<SessionResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
                method: 'PATCH',
                body: JSON.stringify({ name }),
            })
            return response.session
        },

        async deleteSession(sessionId: string): Promise<void> {
            await core.request(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
        },
    }
}

async function postSessionSnapshotAction(
    core: {
        requestUnknown: ApiClientUnknownRequest
        resolveSessionActionSnapshotResponse: ApiClientResolveSessionActionSnapshotResponse
    },
    sessionId: string,
    action: SessionSnapshotAction,
    body: Record<string, unknown>
): Promise<Session> {
    const response = await core.requestUnknown(`/api/sessions/${encodeURIComponent(sessionId)}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body),
    })
    return await core.resolveSessionActionSnapshotResponse(response, sessionId, action)
}
