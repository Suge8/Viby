import type { RefObject } from 'react'
import type { SessionDriver } from '@viby/protocol'
import type { PiModelCapability } from '@/types/api'
import type { SameSessionSwitchTargetDriver } from '@/lib/sameSessionDriverSwitch'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from '@/types/api'
import type { Suggestion } from '@/hooks/useActiveSuggestions'
import type { AssistantReplyingPhase } from '@/components/AssistantChat/assistantReplyingPhase'

export type ComposerPanelId = 'controls'

export type ComposerConfigState = {
    permissionMode?: PermissionMode
    collaborationMode?: CodexCollaborationMode
    model?: string | null
    piModelCapabilities?: PiModelCapability[] | null
    availableReasoningEfforts?: ModelReasoningEffort[] | null
    modelReasoningEffort?: ModelReasoningEffort | null
    isResuming?: boolean
    active?: boolean
    allowSendWhenInactive?: boolean
    controlledByUser?: boolean
    sessionDriver?: SessionDriver | null
    switchTargetDriver?: SameSessionSwitchTargetDriver | null
    switchDriverPending?: boolean
    attachmentsSupported?: boolean
}

export type ComposerActionHandlers = {
    onCollaborationModeChange?: (mode: CodexCollaborationMode) => void
    onPermissionModeChange?: (mode: PermissionMode) => void
    onModelChange?: (model: string | null) => void
    onModelReasoningEffortChange?: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onSwitchSessionDriver?: () => void | Promise<void>
    autocompleteSuggestions?: (query: string) => Promise<Suggestion[]>
}

export type VibyComposerModel = {
    sessionId: string
    disabled?: boolean
    onWarmSession?: () => void
    replyingPhase?: AssistantReplyingPhase | null
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    autocompletePrefixes?: string[]
    containerRef?: RefObject<HTMLDivElement | null>
}
