import type { SameSessionSwitchTargetDriver, SessionDriver } from '@viby/protocol'
import type { ComposerEnterBehavior } from '@/components/AssistantChat/composerEnterBehavior'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type {
    CodexCollaborationMode,
    CodexServiceTier,
    ModelReasoningEffort,
    PermissionMode,
    PiModelCapability,
} from '@/types/api'

export type ComposerPanelId = 'controls'

export type ComposerConfigState = {
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    model?: string | null
    piModelCapabilities?: PiModelCapability[] | null
    availableReasoningEfforts?: ModelReasoningEffort[] | null
    modelReasoningEffort?: ModelReasoningEffort | null
    codexServiceTier?: CodexServiceTier | null
    active?: boolean
    allowSendWhenInactive?: boolean
    controlledByUser?: boolean
    sessionDriver?: SessionDriver | null
    switchTargetDrivers?: readonly SameSessionSwitchTargetDriver[] | null
    switchDriverPending?: boolean
    attachmentsSupported?: boolean
    enterBehavior?: ComposerEnterBehavior
}

export type ComposerActionHandlers = {
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onModelReasoningEffortChange?: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onCodexServiceTierChange?: (codexServiceTier: CodexServiceTier | null) => void
    onEnterBehaviorChange?: (behavior: ComposerEnterBehavior) => void
    onSwitchSessionDriver?: (targetDriver: SameSessionSwitchTargetDriver) => void | Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
    autocompleteRefreshKey?: number
    onSuggestionAction?: (suggestion: Suggestion) => void
}

export type VibyComposerModel = {
    sessionId: string
    disabled?: boolean
    sendPending?: boolean
    autocompleteLayout?: {
        visibleViewportBottomPx: number
    }
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    autocompletePrefixes?: string[]
}
