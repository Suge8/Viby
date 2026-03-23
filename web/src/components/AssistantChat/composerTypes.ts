import type { RefObject } from 'react'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

export type ComposerPanelId = 'controls'

export type ComposerConfigState = {
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    model?: string | null
    modelReasoningEffort?: ModelReasoningEffort | null
    active?: boolean
    allowSendWhenInactive?: boolean
    controlledByUser?: boolean
    agentFlavor?: string | null
    attachmentsSupported?: boolean
}

export type ComposerActionHandlers = {
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onModelReasoningEffortChange?: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onSwitchToRemote?: () => void
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
}

export type VibyComposerModel = {
    sessionId: string
    disabled?: boolean
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    autocompletePrefixes?: string[]
    containerRef?: RefObject<HTMLDivElement | null>
}
