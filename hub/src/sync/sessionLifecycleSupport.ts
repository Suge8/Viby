import type { SessionHandoffSnapshot } from '@viby/protocol'
import type { Session } from '@viby/protocol/types'
import type { RpcGateway } from './rpcGateway'
import type { ResumeContractState } from './sessionSpawnSupport'

export type SessionSpawnOptions = Parameters<RpcGateway['spawnSession']>[0]
export type ResumeContractFailureState = Exclude<ResumeContractState, 'ready'>

export type ResumeSessionHooks = {
    cleanupFailedResumeSpawn: (
        originalSessionId: string,
        spawnedSessionId: string,
        resumeToken: string
    ) => Promise<string | null>
    waitForResumedSessionContract: (
        sessionId: string,
        resumeToken: string,
        timeoutMs?: number
    ) => Promise<ResumeContractState>
    writeSessionResumeToken: (sessionId: string, token: string | undefined) => Promise<void>
    buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
}

export type DriverSwitchHooks = {
    buildSessionHandoff: (sessionId: string) => SessionHandoffSnapshot
}

export const SESSION_NOT_FOUND_ERROR = 'Session not found'
export const ARCHIVED_BY_WEB = 'web'
export const ARCHIVED_BY_USER_REASON = 'Archived by user'

export function assertSessionExists(session: Session | undefined): Session {
    if (!session) {
        throw new Error(SESSION_NOT_FOUND_ERROR)
    }
    return session
}

export function getResumeContractFailureMessage(state: ResumeContractFailureState): string {
    switch (state) {
        case 'timeout':
            return 'Session resume timed out before the previous agent session reattached'
        case 'inactive_after_spawn':
            return 'Session exited before the previous agent session reattached'
        case 'token_mismatch':
            return 'Session failed to reattach to the previous agent session'
    }
}

export function resolveResumeSessionHooks(
    hooks: Partial<ResumeSessionHooks> | undefined,
    defaults: Omit<ResumeSessionHooks, 'buildSessionHandoff'> & {
        buildSessionHandoff?: ResumeSessionHooks['buildSessionHandoff']
    }
): ResumeSessionHooks {
    return {
        cleanupFailedResumeSpawn: hooks?.cleanupFailedResumeSpawn ?? defaults.cleanupFailedResumeSpawn,
        waitForResumedSessionContract: hooks?.waitForResumedSessionContract ?? defaults.waitForResumedSessionContract,
        writeSessionResumeToken: hooks?.writeSessionResumeToken ?? defaults.writeSessionResumeToken,
        buildSessionHandoff:
            hooks?.buildSessionHandoff ??
            defaults.buildSessionHandoff ??
            (() => {
                throw new Error('Failed to build session continuity handoff')
            }),
    }
}
