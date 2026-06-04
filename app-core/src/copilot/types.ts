import type { CopilotPermissionMode } from '@viby/protocol/types'

export type PermissionMode = CopilotPermissionMode

export interface EnhancedMode {
    permissionMode: PermissionMode
    model?: string
    developerInstructions?: string
}
