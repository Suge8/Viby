import {
    getPermissionModesForDriver,
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver
} from './modes'
import type { Session } from './schemas'
import { resolveSessionDriver } from './sessionDriver'

export type LiveSessionConfigSource = Pick<Session, 'active' | 'agentState' | 'metadata'>

export type LiveSessionConfigSupport = {
    isRemoteManaged: boolean
    canChangePermissionMode: boolean
    canChangeCollaborationMode: boolean
    canChangeModel: boolean
    canChangeModelReasoningEffort: boolean
}

export function getLiveSessionConfigSupport(session: LiveSessionConfigSource): LiveSessionConfigSupport {
    const driver = resolveSessionDriver(session.metadata)
    const isRemoteManaged = session.active && session.agentState?.controlledByUser !== true
    const hasPermissionModes = driver ? getPermissionModesForDriver(driver).length > 0 : false
    const hasLiveModelSelection = driver ? supportsLiveModelSelectionForDriver(driver) : false
    const hasLiveModelReasoningEffort = driver ? supportsLiveModelReasoningEffortForDriver(driver) : false
    const isRemoteCodexSession = isRemoteManaged && driver === 'codex'

    return {
        isRemoteManaged,
        canChangePermissionMode: isRemoteManaged && hasPermissionModes,
        canChangeCollaborationMode: isRemoteCodexSession,
        canChangeModel: isRemoteManaged && hasLiveModelSelection,
        canChangeModelReasoningEffort: isRemoteManaged && hasLiveModelReasoningEffort,
    }
}
