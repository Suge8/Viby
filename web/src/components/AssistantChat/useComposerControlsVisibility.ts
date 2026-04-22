import {
    getPermissionModesForDriver,
    supportsLiveModelReasoningEffortForDriver,
    supportsLiveModelSelectionForDriver,
} from '@viby/protocol'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import type { PermissionMode } from '@/types/api'

export function getComposerPermissionModes(sessionDriver: string | null): readonly PermissionMode[] {
    return getPermissionModesForDriver(sessionDriver)
}

export function hasComposerControls(config: ComposerConfigState, handlers: ComposerActionHandlers): boolean {
    const sessionDriver = config.sessionDriver ?? null
    const permissionModes = getComposerPermissionModes(sessionDriver)

    return Boolean(
        (handlers.onPermissionModeChange && permissionModes.length > 0) ||
            (handlers.onCollaborationModeChange && sessionDriver === 'codex') ||
            (handlers.onModelChange && supportsLiveModelSelectionForDriver(sessionDriver)) ||
            (handlers.onModelReasoningEffortChange && supportsLiveModelReasoningEffortForDriver(sessionDriver)) ||
            (Boolean(config.switchTargetDrivers?.length) && Boolean(handlers.onSwitchSessionDriver))
    )
}
