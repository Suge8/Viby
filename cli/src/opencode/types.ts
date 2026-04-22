import type { OpencodePermissionMode } from '@viby/protocol/types'

export type PermissionMode = OpencodePermissionMode

export interface OpencodeMode {
    permissionMode: PermissionMode
    developerInstructions?: string
}

export type OpencodeHookEvent = {
    event: string
    payload: unknown
    sessionId?: string
}
