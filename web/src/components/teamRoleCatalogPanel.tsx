import type { ChangeEvent, RefObject } from 'react'
import type { TeamRoleDefinition } from '@/types/api'
import { ArrowDownIcon, PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
    getRoleCardSubtitle,
    getRoleCardTitle,
    getRoleCatalogSectionLabel,
    type TeamRoleCatalogSection,
    type TeamRoleManagerPendingAction,
} from '@/components/teamRoleManagerSupport'

const NOTICE_CLASS_NAME = 'rounded-[1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-3 py-2 text-xs text-[var(--app-hint)]'
const ERROR_CLASS_NAME = 'rounded-[1rem] border border-[color:color-mix(in_srgb,var(--ds-danger)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--ds-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--ds-danger)]'
const CARD_CLASS_NAME = 'rounded-[1.2rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-4 py-3'
const EMPTY_STATE_CLASS_NAME = 'rounded-[1.2rem] border border-dashed border-[var(--ds-border-default)] px-4 py-4 text-sm text-[var(--app-hint)]'

type TeamRoleCatalogPanelProps = {
    state: {
        projectId: string | null
        sections: TeamRoleCatalogSection[]
        error: string | null
        importBlockedReason: string | null
        mutationDisabled: boolean
        pendingAction: TeamRoleManagerPendingAction | null
    }
    actions: {
        onExportPreset: () => void
        onImportPreset: () => void
        onCreateRole: () => void
        onCreateFromPrototype: (prototype: TeamRoleDefinition['prototype']) => void
        onEditRole: (role: TeamRoleDefinition) => void
        onDeleteRole: (roleId: string) => void
        onImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void
    }
    fileInputRef: RefObject<HTMLInputElement | null>
}

type TeamRoleCatalogCardProps = {
    role: TeamRoleDefinition
    disabled: boolean
    onCreateFromPrototype: (prototype: TeamRoleDefinition['prototype']) => void
    onEditRole: (role: TeamRoleDefinition) => void
    onDeleteRole: (roleId: string) => void
}

function getRoleCatalogEmptyMessage(source: TeamRoleDefinition['source']): string {
    if (source === 'builtin') {
        return 'Built-in prototypes 暂时不可用。'
    }

    return '还没有 custom role。建议先从 built-in prototype 派生一个变体。'
}

function TeamRoleCatalogCard(props: TeamRoleCatalogCardProps): React.JSX.Element {
    const { disabled, role, onCreateFromPrototype, onDeleteRole, onEditRole } = props

    return (
        <article className={CARD_CLASS_NAME}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--ds-text-primary)]">
                        {getRoleCardTitle(role)}
                    </div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">
                        {getRoleCardSubtitle(role)}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onCreateFromPrototype(role.prototype)}
                        disabled={disabled}
                    >
                        基于此新建
                    </Button>
                    {role.source === 'custom' ? (
                        <>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onEditRole(role)}
                                disabled={disabled}
                            >
                                编辑
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => onDeleteRole(role.id)}
                                disabled={disabled}
                            >
                                删除
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>
            {role.promptExtension ? (
                <div className="mt-3 rounded-[1rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-3 py-2 text-xs leading-relaxed text-[var(--app-hint)]">
                    {role.promptExtension}
                </div>
            ) : null}
        </article>
    )
}

export function TeamRoleCatalogPanel(props: TeamRoleCatalogPanelProps): React.JSX.Element {
    const { actions, fileInputRef, state } = props
    const mutationPending = state.pendingAction !== null
    const roleMutationDisabled = state.mutationDisabled || mutationPending
    const importDisabled = !state.projectId || Boolean(state.importBlockedReason) || mutationPending
    const exportDisabled = !state.projectId || mutationPending

    return (
        <section className="min-h-0 overflow-y-auto border-b border-[var(--ds-border-default)] bg-[var(--ds-panel)] px-5 py-4 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                        Role Catalog
                    </div>
                    <div className="mt-1 text-sm text-[var(--app-hint)]">
                        当前 surface 只直接管理 custom role overlay；built-in prototypes 保持单一基线。
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={actions.onExportPreset}
                        disabled={exportDisabled}
                    >
                        <ArrowDownIcon className="mr-1.5 h-4 w-4" />
                        导出 preset
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={actions.onImportPreset}
                        disabled={importDisabled}
                    >
                        <PlusIcon className="mr-1.5 h-4 w-4" />
                        导入 preset
                    </Button>
                    <Button
                        size="sm"
                        onClick={actions.onCreateRole}
                        disabled={roleMutationDisabled}
                    >
                        <PlusIcon className="mr-1.5 h-4 w-4" />
                        新建 custom role
                    </Button>
                </div>
            </div>
            {state.importBlockedReason ? (
                <div className={`mt-3 ${NOTICE_CLASS_NAME}`}>
                    {state.importBlockedReason}
                </div>
            ) : null}
            {state.error ? (
                <div className={`mt-3 ${ERROR_CLASS_NAME}`}>
                    {state.error}
                </div>
            ) : null}
            <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={actions.onImportFileChange}
            />

            {state.sections.map((section) => (
                <div key={section.source} className="mt-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-hint)]">
                        {getRoleCatalogSectionLabel(section.source)}
                    </div>
                    <div className="mt-3 space-y-3">
                        {section.roles.length > 0 ? section.roles.map((role) => (
                            <TeamRoleCatalogCard
                                key={role.id}
                                role={role}
                                disabled={roleMutationDisabled}
                                onCreateFromPrototype={actions.onCreateFromPrototype}
                                onEditRole={actions.onEditRole}
                                onDeleteRole={actions.onDeleteRole}
                            />
                        )) : (
                            <div className={EMPTY_STATE_CLASS_NAME}>
                                {getRoleCatalogEmptyMessage(section.source)}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </section>
    )
}
