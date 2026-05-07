import type {
    CodexCollaborationMode,
    CodexServiceTier,
    CommandCapabilitiesResponse,
    ModelReasoningEffort,
    PermissionMode,
    Session,
} from '@viby/protocol/types'
import type { LocalHubPairingRequestJson } from './localHubPairingRequest'

export async function postSessionAction(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    action: string,
    body: Record<string, unknown>
): Promise<Session> {
    const response = await requestJson<{ session: Session }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/${action}`,
        {
            method: 'POST',
            body: JSON.stringify(body),
        }
    )
    return response.session
}

export async function renameSession(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    name: string
): Promise<Session> {
    const response = await requestJson<{ session: Session }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
    })
    return response.session
}

export async function deleteSession(requestJson: LocalHubPairingRequestJson, sessionId: string): Promise<void> {
    await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

export async function switchSessionDriver(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    targetDriver: string
): Promise<Session> {
    const response = await requestJson<{ session: Session }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/driver-switch`,
        { method: 'POST', body: JSON.stringify({ targetDriver }) }
    )
    return response.session
}

export async function setPermissionMode(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    mode: PermissionMode
): Promise<Session> {
    return await postSessionAction(requestJson, sessionId, 'permission-mode', { mode })
}

export async function setCollaborationMode(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    mode: CodexCollaborationMode
): Promise<Session> {
    return await postSessionAction(requestJson, sessionId, 'collaboration-mode', { mode })
}

export async function setModel(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    model: string | null
): Promise<Session> {
    return await postSessionAction(requestJson, sessionId, 'model', { model })
}

export async function setModelReasoningEffort(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    modelReasoningEffort: ModelReasoningEffort | null
): Promise<Session> {
    return await postSessionAction(requestJson, sessionId, 'model-reasoning-effort', { modelReasoningEffort })
}

export async function setCodexServiceTier(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    codexServiceTier: CodexServiceTier | null
): Promise<Session> {
    return await postSessionAction(requestJson, sessionId, 'codex-service-tier', { codexServiceTier })
}

export async function approvePermission(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    requestId: string,
    body: {
        mode?: PermissionMode
        allowTools?: string[]
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
        answers?: unknown
    }
): Promise<void> {
    await requestJson(
        `/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/approve`,
        {
            method: 'POST',
            body: JSON.stringify(body),
        }
    )
}

export async function denyPermission(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    requestId: string,
    decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort'
): Promise<void> {
    await requestJson(
        `/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}/deny`,
        {
            method: 'POST',
            body: JSON.stringify(decision ? { decision } : {}),
        }
    )
}

export async function getCommandCapabilities(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    revision?: string
): Promise<CommandCapabilitiesResponse> {
    const query = revision ? `?${new URLSearchParams({ revision }).toString()}` : ''
    return await requestJson<CommandCapabilitiesResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/command-capabilities${query}`
    )
}
