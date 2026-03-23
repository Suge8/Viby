import type { ReactNode } from 'react'
import type {
    CodexCollaborationMode,
    ModelReasoningEffort,
    PermissionMode,
} from '@/types/api'
import { ComposerActionSection } from '@/components/AssistantChat/ComposerActionSection'
import { ComposerSettingsSection } from '@/components/AssistantChat/ComposerSettingsSection'
import { SwitchToRemoteIcon } from '@/components/icons'
import type { ComposerPanelOption } from '@/lib/sessionConfigPresentation'

type Translate = (key: string) => string

type ComposerActionItemDescriptor = {
    key: string
    label: string
    description: string
    icon: ReactNode
    disabled: boolean
    onSelect: () => void
}

type BuildComposerControlSectionsOptions = {
    collaborationMode: CodexCollaborationMode
    collaborationModeOptions: ComposerPanelOption<CodexCollaborationMode>[]
    controlsDisabled: boolean
    model: string | null
    modelOptions: ComposerPanelOption<string | null>[]
    modelReasoningEffort: ModelReasoningEffort | null
    onCollaborationChange: (mode: CodexCollaborationMode) => void
    onModelChange: (model: string | null) => void
    onModelReasoningEffortChange: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onPermissionChange: (mode: PermissionMode) => void
    onSwitchToRemote?: () => void
    permissionMode: PermissionMode
    permissionModeOptions: ComposerPanelOption<PermissionMode>[]
    reasoningEffortOptions: ComposerPanelOption<ModelReasoningEffort | null>[]
    showCollaborationSettings: boolean
    showModelSettings: boolean
    showPermissionSettings: boolean
    showReasoningEffortSettings: boolean
    t: Translate
}

function appendSettingsSection<T extends string | null>(
    sections: ReactNode[],
    section: {
        visible: boolean
        sectionKey: string
        title: string
        description: string
        options: ComposerPanelOption<T>[]
        selectedValue: T
        disabled: boolean
        onSelect: (value: T) => void
    }
): void {
    if (!section.visible) {
        return
    }

    sections.push(
        <ComposerSettingsSection
            key={section.sectionKey}
            title={section.title}
            description={section.description}
            options={section.options}
            selectedValue={section.selectedValue}
            disabled={section.disabled}
            onSelect={section.onSelect}
        />
    )
}

function buildComposerActionItems(options: {
    controlsDisabled: boolean
    onSwitchToRemote?: () => void
    t: Translate
}): ComposerActionItemDescriptor[] {
    const items: ComposerActionItemDescriptor[] = []

    if (options.onSwitchToRemote) {
        items.push({
            key: 'switch-remote',
            label: options.t('composer.switchRemote'),
            description: options.t('chat.switchRemote'),
            icon: <SwitchToRemoteIcon className="h-4 w-4" />,
            disabled: options.controlsDisabled,
            onSelect: options.onSwitchToRemote
        })
    }

    return items
}

export function buildComposerControlSections(options: BuildComposerControlSectionsOptions): ReactNode[] {
    const sections: ReactNode[] = []

    appendSettingsSection(sections, {
        visible: options.showModelSettings,
        sectionKey: 'model',
        title: options.t('misc.model'),
        description: options.t('composer.panel.model.model.description'),
        options: options.modelOptions,
        selectedValue: options.model,
        disabled: options.controlsDisabled,
        onSelect: options.onModelChange
    })

    appendSettingsSection(sections, {
        visible: options.showReasoningEffortSettings,
        sectionKey: 'reasoning-effort',
        title: options.t('misc.reasoningEffort'),
        description: options.t('composer.panel.model.reasoning.description'),
        options: options.reasoningEffortOptions,
        selectedValue: options.modelReasoningEffort,
        disabled: options.controlsDisabled,
        onSelect: options.onModelReasoningEffortChange
    })

    appendSettingsSection(sections, {
        visible: options.showCollaborationSettings,
        sectionKey: 'collaboration',
        title: options.t('misc.collaborationMode'),
        description: options.t('composer.panel.settings.collaboration.description'),
        options: options.collaborationModeOptions,
        selectedValue: options.collaborationMode,
        disabled: options.controlsDisabled,
        onSelect: options.onCollaborationChange
    })

    appendSettingsSection(sections, {
        visible: options.showPermissionSettings,
        sectionKey: 'permission',
        title: options.t('misc.permissionMode'),
        description: options.t('composer.panel.settings.permission.description'),
        options: options.permissionModeOptions,
        selectedValue: options.permissionMode,
        disabled: options.controlsDisabled,
        onSelect: options.onPermissionChange
    })

    const actionItems = buildComposerActionItems({
        controlsDisabled: options.controlsDisabled,
        onSwitchToRemote: options.onSwitchToRemote,
        t: options.t
    })

    if (actionItems.length > 0) {
        sections.push(
            <ComposerActionSection
                key="actions"
                title={options.t('composer.actions')}
                items={actionItems}
            />
        )
    }

    return sections
}
