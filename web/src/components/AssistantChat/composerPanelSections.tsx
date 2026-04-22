import type { SameSessionSwitchTargetDriver, SessionDriver } from '@viby/protocol'
import type { ReactNode } from 'react'
import { ComposerActionSection } from '@/components/AssistantChat/ComposerActionSection'
import { ComposerSettingsSection } from '@/components/AssistantChat/ComposerSettingsSection'
import { getSelectedComposerOptionLabel } from '@/components/AssistantChat/composerControlPresentation'
import {
    FeatureAgentIcon as AgentIcon,
    FeatureGitBranchIcon as CollaborationIcon,
    FeatureModelIcon as ModelIcon,
    FeatureBulbIcon as ReasoningIcon,
    FeatureShieldIcon as ShieldIcon,
    FeatureSwitchToRemoteIcon as SwitchToRemoteIcon,
} from '@/components/featureIcons'
import type { ComposerPanelOption } from '@/lib/sessionConfigPresentation'
import {
    COMPOSER_COLLABORATION_SECTION_TEST_ID,
    COMPOSER_MODEL_SECTION_TEST_ID,
    COMPOSER_PERMISSION_SECTION_TEST_ID,
    COMPOSER_REASONING_SECTION_TEST_ID,
    COMPOSER_SWITCH_AGENT_SECTION_TEST_ID,
    getComposerSwitchTargetTestId,
} from '@/lib/sessionUiContracts'
import type { CodexCollaborationMode, ModelReasoningEffort, PermissionMode } from '@/types/api'

type Translate = (key: string, params?: Record<string, string | number>) => string

type ComposerActionItemDescriptor = {
    key: string
    label: string
    pendingLabel?: string
    icon: ReactNode
    disabled: boolean
    pending?: boolean
    testId?: string
    onSelect: () => void
}

type ComposerSettingsSectionDescriptor<T extends string | null> = {
    key: string
    options: readonly ComposerPanelOption<T>[]
    selectedValue: T
    testId: string
    title: string
    icon: ReactNode
    onSelect: (value: T) => void
}

type BuildComposerControlSectionsOptions = {
    collaborationMode: CodexCollaborationMode
    collaborationModeOptions: readonly ComposerPanelOption<CodexCollaborationMode>[]
    controlsDisabled: boolean
    model: string | null
    modelOptions: readonly ComposerPanelOption<string | null>[]
    modelReasoningEffort: ModelReasoningEffort | null
    sessionDriver: SessionDriver | null
    onCollaborationChange: (mode: CodexCollaborationMode) => void
    onModelChange: (model: string | null) => void
    onModelReasoningEffortChange: (modelReasoningEffort: ModelReasoningEffort | null) => void
    onPermissionChange: (mode: PermissionMode) => void
    switchTargetDrivers?: readonly SameSessionSwitchTargetDriver[] | null
    switchDriverPending?: boolean
    onSwitchSessionDriver?: (targetDriver: SameSessionSwitchTargetDriver) => void
    permissionMode: PermissionMode
    permissionModeOptions: readonly ComposerPanelOption<PermissionMode>[]
    reasoningEffortOptions: readonly ComposerPanelOption<ModelReasoningEffort | null>[]
    showCollaborationSettings: boolean
    showModelSettings: boolean
    showPermissionSettings: boolean
    showReasoningEffortSettings: boolean
    t: Translate
}

function getDriverLabel(targetDriver: SessionDriver | SameSessionSwitchTargetDriver, t: Translate): string {
    return t(`composer.switchDriver.target.${targetDriver}`)
}

function buildComposerActionItems(options: {
    controlsDisabled: boolean
    switchTargetDrivers?: readonly SameSessionSwitchTargetDriver[] | null
    switchDriverPending?: boolean
    onSwitchSessionDriver?: (targetDriver: SameSessionSwitchTargetDriver) => void
    t: Translate
}): ComposerActionItemDescriptor[] {
    if (!options.switchTargetDrivers || !options.onSwitchSessionDriver) {
        return []
    }

    const onSwitchSessionDriver = options.onSwitchSessionDriver

    return options.switchTargetDrivers.map((targetDriver) => {
        const targetLabel = getDriverLabel(targetDriver, options.t)

        return {
            key: `switch-driver:${targetDriver}`,
            label: options.t('composer.switchDriver', { driver: targetLabel }),
            pendingLabel: options.t('composer.switchDriver.pending', { driver: targetLabel }),
            icon: <SwitchToRemoteIcon className="h-4 w-4" />,
            disabled: options.controlsDisabled || options.switchDriverPending === true,
            pending: options.switchDriverPending === true,
            testId: getComposerSwitchTargetTestId(targetDriver),
            onSelect: () => onSwitchSessionDriver(targetDriver),
        }
    })
}

function buildComposerSettingsSection<T extends string | null>(
    descriptor: ComposerSettingsSectionDescriptor<T>,
    controlsDisabled: boolean,
    t: Translate
): ReactNode {
    return (
        <ComposerSettingsSection
            key={descriptor.key}
            icon={descriptor.icon}
            testId={descriptor.testId}
            title={descriptor.title}
            summary={getSelectedComposerOptionLabel(descriptor.options, descriptor.selectedValue, t)}
            options={descriptor.options}
            selectedValue={descriptor.selectedValue}
            disabled={controlsDisabled}
            onSelect={descriptor.onSelect}
        />
    )
}

export function buildComposerControlSections(options: BuildComposerControlSectionsOptions): ReactNode[] {
    const sections: ReactNode[] = []
    const actionItems = buildComposerActionItems({
        controlsDisabled: options.controlsDisabled,
        switchTargetDrivers: options.switchTargetDrivers,
        switchDriverPending: options.switchDriverPending,
        onSwitchSessionDriver: options.onSwitchSessionDriver,
        t: options.t,
    })

    if (actionItems.length > 0) {
        const currentDriverLabel = options.sessionDriver ? getDriverLabel(options.sessionDriver, options.t) : null

        sections.push(
            <ComposerActionSection
                key="actions"
                currentDriver={options.sessionDriver}
                icon={<AgentIcon className="h-4 w-4" />}
                testId={COMPOSER_SWITCH_AGENT_SECTION_TEST_ID}
                title={options.t('composer.switchAgent')}
                summary={currentDriverLabel ? options.t('composer.currentAgent', { driver: currentDriverLabel }) : null}
                items={actionItems}
            />
        )
    }

    const settingsSections: Array<ReactNode | null> = [
        options.showModelSettings
            ? buildComposerSettingsSection(
                  {
                      key: 'model',
                      icon: <ModelIcon className="h-4 w-4" />,
                      testId: COMPOSER_MODEL_SECTION_TEST_ID,
                      title: options.t('misc.model'),
                      options: options.modelOptions,
                      selectedValue: options.model,
                      onSelect: options.onModelChange,
                  },
                  options.controlsDisabled,
                  options.t
              )
            : null,
        options.showReasoningEffortSettings
            ? buildComposerSettingsSection(
                  {
                      key: 'reasoning-effort',
                      icon: <ReasoningIcon className="h-4 w-4" />,
                      testId: COMPOSER_REASONING_SECTION_TEST_ID,
                      title: options.t('misc.reasoningEffort'),
                      options: options.reasoningEffortOptions,
                      selectedValue: options.modelReasoningEffort,
                      onSelect: options.onModelReasoningEffortChange,
                  },
                  options.controlsDisabled,
                  options.t
              )
            : null,
        options.showCollaborationSettings
            ? buildComposerSettingsSection(
                  {
                      key: 'collaboration',
                      icon: <CollaborationIcon className="h-4 w-4" />,
                      testId: COMPOSER_COLLABORATION_SECTION_TEST_ID,
                      title: options.t('misc.collaborationMode'),
                      options: options.collaborationModeOptions,
                      selectedValue: options.collaborationMode,
                      onSelect: options.onCollaborationChange,
                  },
                  options.controlsDisabled,
                  options.t
              )
            : null,
        options.showPermissionSettings
            ? buildComposerSettingsSection(
                  {
                      key: 'permission',
                      icon: <ShieldIcon className="h-4 w-4" />,
                      testId: COMPOSER_PERMISSION_SECTION_TEST_ID,
                      title: options.t('misc.permissionMode'),
                      options: options.permissionModeOptions,
                      selectedValue: options.permissionMode,
                      onSelect: options.onPermissionChange,
                  },
                  options.controlsDisabled,
                  options.t
              )
            : null,
    ]

    for (const section of settingsSections) {
        if (section !== null) {
            sections.push(section)
        }
    }

    return sections
}
