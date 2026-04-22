import {
    getSessionResumeToken,
    resolveSessionDriver,
    type SessionDriver,
    setSessionDriverRuntimeHandle,
} from '@viby/protocol'
import type { Session, SyncEvent } from '@viby/protocol/types'
import type { MachineCache } from './machineCache'
import type { RpcGateway } from './rpcGateway'

type SessionSpawnOptions = Parameters<RpcGateway['spawnSession']>[0]

export const DEFAULT_SESSION_DRIVER: SessionDriver = 'claude'
export const RESUME_CONTRACT_TIMEOUT_MS = 15_000
export const DRIVER_SWITCH_CONTRACT_TIMEOUT_MS = 15_000
export const SPAWN_ACTIVE_SETTLE_TIMEOUT_MS = 5_000

export function isSessionStateEvent(event: SyncEvent): boolean {
    return event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed'
}

export function withSessionResumeToken(metadata: Session['metadata'], token: string | undefined): Session['metadata'] {
    if (!metadata) {
        return metadata
    }

    const driver = resolveSessionDriver(metadata) ?? DEFAULT_SESSION_DRIVER
    return setSessionDriverRuntimeHandle(
        metadata,
        driver,
        token ? { sessionId: token } : undefined
    ) as Session['metadata']
}

export function resolveSessionSpawnDriver(metadata: Session['metadata']): NonNullable<SessionSpawnOptions['agent']> {
    return resolveSessionDriver(metadata) ?? DEFAULT_SESSION_DRIVER
}

export function isMissingKillSessionHandler(error: unknown, sessionId: string): boolean {
    return error instanceof Error && error.message === `RPC handler not registered: ${sessionId}:killSession`
}

export function resolveResumeTargetMachine(machineCache: MachineCache, session: Session) {
    const metadata = session.metadata
    if (!metadata) {
        return null
    }

    const onlineMachines = machineCache.getOnlineMachines()
    if (onlineMachines.length === 0) {
        return null
    }

    if (metadata.machineId) {
        const exactMatch = onlineMachines.find((machine) => machine.id === metadata.machineId)
        if (exactMatch) {
            return exactMatch
        }
    }

    if (metadata.host) {
        const hostMatch = onlineMachines.find((machine) => machine.metadata?.host === metadata.host)
        if (hostMatch) {
            return hostMatch
        }
    }

    return null
}

export function buildSessionSpawnOptions(
    session: Session,
    machineId: string,
    directory: string,
    resumeSessionId?: string
): SessionSpawnOptions {
    return {
        sessionId: session.id,
        machineId,
        directory,
        agent: resolveSessionSpawnDriver(session.metadata),
        model: session.model ?? undefined,
        modelReasoningEffort: session.modelReasoningEffort ?? undefined,
        permissionMode: session.permissionMode,
        resumeSessionId,
        collaborationMode: session.collaborationMode,
    }
}

export function readResumeToken(session: Session, includeResumeToken: boolean): string | undefined {
    return includeResumeToken ? getSessionResumeToken(session.metadata) : undefined
}
