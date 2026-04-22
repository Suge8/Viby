import type { SameSessionSwitchTargetDriver, SessionDriver } from '@viby/protocol'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode, PiModelCapability } from '@/types/api'

export type ComposerPanelId = 'controls'

export type ComposerConfigState = {
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    model?: string | null
    piModelCapabilities?: PiModelCapability[] | null
    availableReasoningEfforts?: ModelReasoningEffort[] | null
    modelReasoningEffort?: ModelReasoningEffort | null
    active?: boolean
    allowSendWhenInactive?: boolean
    controlledByUser?: boolean
    sessionDriver?: SessionDriver | null
    switchTargetDrivers?: readonly SameSessionSwitchTargetDriver[] | null
    switchDriverPending?: boolean
    attachmentsSupported?: boolean
}

export type ComposerActionHandlers = {
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onModelReasoningEffortChange?: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onSwitchSessionDriver?: (targetDriver: SameSessionSwitchTargetDriver) => void | Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    autocompleteRefreshKey?: number
    onSuggestionAction?: (suggestion: Suggestion) => void
}

export type VibyComposerModel = {
    sessionId: string
    disabled?: boolean
    replyingPhase?: AssistantReplyingPhase | null
    autocompleteLayout?: {
        visibleViewportBottomPx: number
    }
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    autocompletePrefixes?: string[]
}
