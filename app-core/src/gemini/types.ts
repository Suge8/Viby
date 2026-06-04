import type { GeminiPermissionMode } from '@viby/protocol/types'

export type PermissionMode = GeminiPermissionMode

export interface GeminiMode {
    permissionMode: PermissionMode
    model?: string
    developerInstructions?: string
}
