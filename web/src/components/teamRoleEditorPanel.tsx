import type { TeamRoleDefinition } from '@/types/api'
import { Button } from '@/components/ui/button'
import {
    TEAM_PROVIDER_OPTIONS,
    TEAM_REASONING_OPTIONS,
    TEAM_ROLE_PROTOTYPE_OPTIONS,
    type TeamRoleDraft,
    type TeamRoleManagerPendingAction,
} from '@/components/teamRoleManagerSupport'

const CONTROL_CLASS_NAME = 'mt-2 min-h-[44px] w-full rounded-[16px] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-3 py-2 text-sm text-[var(--ds-text-primary)] outline-none focus:border-[var(--ds-border-strong)] disabled:opacity-60'
const EMPTY_STATE_CLASS_NAME = 'mt-3 rounded-[1.2rem] border border-dashed border-[var(--ds-border-default)] px-4 py-4 text-sm text-[var(--app-hint)]'

type TeamRoleEditorPanelProps = {
    state: {
        draft: TeamRoleDraft | null
        mutationDisabled: boolean
        pendingAction: TeamRoleManagerPendingAction | null
        saveDisabled: boolean
    }
    actions: {
        onDraftChange: (change: Partial<TeamRoleDraft>) => void
        onCancel: () => void
        onSave: () => void
    }
}

function getSaveButtonLabel(
    draft: TeamRoleDraft,
    pendingAction: TeamRoleManagerPendingAction | null,
): string {
    if (pendingAction === 'save') {
        return '保存中…'
    }
    if (draft.mode === 'edit') {
        return '保存角色'
    }
    return '创建角色'
}

export function TeamRoleEditorPanel(props: TeamRoleEditorPanelProps): React.JSX.Element {
    const { actions, state } = props
    const { draft } = state

    if (!draft) {
        return (
            <aside className="min-h-0 overflow-y-auto bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                    Create Custom Role
                </div>
                <div className={EMPTY_STATE_CLASS_NAME}>
                    从左侧选择 built-in prototype 派生一个 custom role，或者编辑现有 custom role。
                </div>
            </aside>
        )
    }

    const inputsDisabled = state.mutationDisabled || state.pendingAction !== null
    const saveButtonLabel = getSaveButtonLabel(draft, state.pendingAction)

    return (
        <aside className="min-h-0 overflow-y-auto bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] px-5 py-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                {draft.mode === 'edit' ? 'Edit Custom Role' : 'Create Custom Role'}
            </div>
            <div className="mt-3 space-y-3">
                <label className="block text-sm text-[var(--app-hint)]">
                    <div className="font-medium text-[var(--ds-text-primary)]">Role id</div>
                    <input
                        value={draft.roleId}
                        onChange={(event) => actions.onDraftChange({ roleId: event.target.value })}
                        disabled={draft.mode === 'edit' || inputsDisabled}
                        className={CONTROL_CLASS_NAME}
                        placeholder="mobile-reviewer"
                    />
                </label>
                <label className="block text-sm text-[var(--app-hint)]">
                    <div className="font-medium text-[var(--ds-text-primary)]">Prototype</div>
                    <select
                        value={draft.prototype}
                        onChange={(event) => actions.onDraftChange({
                            prototype: event.target.value as TeamRoleDefinition['prototype'],
                        })}
                        disabled={draft.mode === 'edit' || inputsDisabled}
                        className={CONTROL_CLASS_NAME}
                    >
                        {TEAM_ROLE_PROTOTYPE_OPTIONS.map((prototype) => (
                            <option key={prototype} value={prototype}>{prototype}</option>
                        ))}
                    </select>
                </label>
                <label className="block text-sm text-[var(--app-hint)]">
                    <div className="font-medium text-[var(--ds-text-primary)]">Display name</div>
                    <input
                        value={draft.name}
                        onChange={(event) => actions.onDraftChange({ name: event.target.value })}
                        disabled={inputsDisabled}
                        className={CONTROL_CLASS_NAME}
                        placeholder="Mobile Reviewer"
                    />
                </label>
                <label className="block text-sm text-[var(--app-hint)]">
                    <div className="font-medium text-[var(--ds-text-primary)]">Prompt extension</div>
                    <textarea
                        value={draft.promptExtension}
                        onChange={(event) => actions.onDraftChange({ promptExtension: event.target.value })}
                        rows={4}
                        disabled={inputsDisabled}
                        className={CONTROL_CLASS_NAME}
                        placeholder="Focus on mobile regressions and pwa-safe interactions."
                    />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm text-[var(--app-hint)]">
                        <div className="font-medium text-[var(--ds-text-primary)]">Provider</div>
                        <select
                            value={draft.providerFlavor}
                            onChange={(event) => actions.onDraftChange({
                                providerFlavor: event.target.value as TeamRoleDefinition['providerFlavor'],
                            })}
                            disabled={inputsDisabled}
                            className={CONTROL_CLASS_NAME}
                        >
                            {TEAM_PROVIDER_OPTIONS.map((provider) => (
                                <option key={provider} value={provider}>{provider}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-sm text-[var(--app-hint)]">
                        <div className="font-medium text-[var(--ds-text-primary)]">Isolation</div>
                        <select
                            value={draft.isolationMode}
                            onChange={(event) => actions.onDraftChange({
                                isolationMode: event.target.value as TeamRoleDefinition['isolationMode'],
                            })}
                            disabled={inputsDisabled}
                            className={CONTROL_CLASS_NAME}
                        >
                            <option value="simple">simple</option>
                            <option value="worktree">worktree</option>
                        </select>
                    </label>
                    <label className="block text-sm text-[var(--app-hint)] sm:col-span-2">
                        <div className="font-medium text-[var(--ds-text-primary)]">Model</div>
                        <input
                            value={draft.model}
                            onChange={(event) => actions.onDraftChange({ model: event.target.value })}
                            disabled={inputsDisabled}
                            className={CONTROL_CLASS_NAME}
                            placeholder="optional"
                        />
                    </label>
                    <label className="block text-sm text-[var(--app-hint)] sm:col-span-2">
                        <div className="font-medium text-[var(--ds-text-primary)]">Reasoning</div>
                        <select
                            value={draft.reasoningEffort}
                            onChange={(event) => actions.onDraftChange({
                                reasoningEffort: event.target.value as TeamRoleDraft['reasoningEffort'],
                            })}
                            disabled={inputsDisabled}
                            className={CONTROL_CLASS_NAME}
                        >
                            <option value="">none</option>
                            {TEAM_REASONING_OPTIONS.map((effort) => (
                                <option key={effort} value={effort}>{effort}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={actions.onCancel}
                        disabled={state.pendingAction !== null}
                    >
                        取消
                    </Button>
                    <Button
                        size="sm"
                        onClick={actions.onSave}
                        disabled={state.saveDisabled}
                    >
                        {saveButtonLabel}
                    </Button>
                </div>
            </div>
        </aside>
    )
}
