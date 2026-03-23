import { getPermissionModesForFlavor } from '@viby/protocol'
import { isClaudeFlavor } from '@/lib/agentFlavorUtils'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import type { PermissionMode } from '@/types/api'

export function getComposerPermissionModes(agentFlavor: string | null): readonly PermissionMode[] {
    return getPermissionModesForFlavor(agentFlavor)
}

export function hasComposerControls(
    config: ComposerConfigState,
    handlers: ComposerActionHandlers
): boolean {
    const agentFlavor = config.agentFlavor ?? null
    const permissionModes = getComposerPermissionModes(agentFlavor)

    return Boolean(
        (handlers.onPermissionModeChange && permissionModes.length > 0)
        || (handlers.onCollaborationModeChange && agentFlavor === 'codex')
        || (handlers.onModelChange && (isClaudeFlavor(agentFlavor) || agentFlavor === 'codex'))
        || (handlers.onModelReasoningEffortChange && (agentFlavor === 'claude' || agentFlavor === 'codex'))
        || (config.controlledByUser && handlers.onSwitchToRemote)
    )
}
