import { getPermissionModesForFlavor } from './modes'
import type { Session } from './schemas'

export type LiveSessionConfigSource = Pick<Session, 'active' | 'agentState' | 'metadata'>

export type LiveSessionConfigSupport = {
    isRemoteManaged: boolean
    canChangePermissionMode: boolean
    canChangeCollaborationMode: boolean
    canChangeModel: boolean
    canChangeModelReasoningEffort: boolean
}

export function getLiveSessionConfigSupport(session: LiveSessionConfigSource): LiveSessionConfigSupport {
    const flavor = session.metadata?.flavor ?? 'claude'
    const isRemoteManaged = session.active && session.agentState?.controlledByUser !== true
    const hasPermissionModes = getPermissionModesForFlavor(flavor).length > 0
    const isRemoteCodexSession = isRemoteManaged && flavor === 'codex'

    return {
        isRemoteManaged,
        canChangePermissionMode: isRemoteManaged && hasPermissionModes,
        canChangeCollaborationMode: isRemoteCodexSession,
        canChangeModel: isRemoteCodexSession,
        canChangeModelReasoningEffort: isRemoteCodexSession,
    }
}
