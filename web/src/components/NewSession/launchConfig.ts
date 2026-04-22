import type { PermissionMode } from '@/types/api'
import type { AgentType } from './types'

export function resolveLaunchPermissionMode(agent: AgentType, yoloMode: boolean): PermissionMode {
    if (!yoloMode) {
        return 'default'
    }

    if (agent === 'claude' || agent === 'copilot') {
        return 'bypassPermissions'
    }

    return 'yolo'
}
