import type { Session } from '@viby/protocol/types'
import type { RpcGateway } from './rpcGateway'

export type SessionSpawnOptions = Parameters<RpcGateway['spawnSession']>[0]

export type ResumeContractState = 'ready' | 'token_mismatch' | 'inactive_after_spawn' | 'timeout'

export type SessionSpawnPreparationResult =
    | {
          type: 'success'
          spawnOptions: SessionSpawnOptions
          resumeToken?: string
      }
    | {
          type: 'error'
          code: 'session_archived' | 'resume_unavailable' | 'no_machine_online'
          message: string
      }

export type SpawnInactiveSessionResult = { type: 'success'; sessionId: string } | { type: 'error'; message: string }

export type SessionStateResolver<T> = (session: Session | undefined) => T | null
