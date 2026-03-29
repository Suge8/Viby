import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { ApiClient } from '@/api/client'
import type { TeamProjectSnapshot, TeamRoleDefinition } from '@/types/api'
import { SettingsIcon } from '@/components/icons'
import { TeamRoleCatalogPanel } from '@/components/teamRoleCatalogPanel'
import { TeamRoleEditorPanel } from '@/components/teamRoleEditorPanel'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    buildPresetDownloadName,
    buildRoleCatalogSections,
    createTeamRoleDraft,
    createTeamRoleDraftFromRole,
    downloadTeamProjectPreset,
    getBootstrapImportBlockReason,
    getPresetMutationErrorMessage,
    getRoleMutationErrorMessage,
    parseTeamProjectPresetFile,
    type TeamRoleDraft,
    type TeamRoleManagerPendingAction,
} from '@/components/teamRoleManagerSupport'

type TeamRoleManagerDialogProps = {
    api: ApiClient
    open: boolean
    onOpenChange: (open: boolean) => void
    snapshot: TeamProjectSnapshot | null
    managerSessionId: string
    onSnapshotChanged: () => Promise<unknown>
}

export function TeamRoleManagerDialog({
    api,
    managerSessionId,
    onOpenChange,
    onSnapshotChanged,
    open,
    snapshot,
}: TeamRoleManagerDialogProps): React.JSX.Element {
    const [draft, setDraft] = useState<TeamRoleDraft | null>(null)
    const [pendingAction, setPendingAction] = useState<TeamRoleManagerPendingAction | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const projectId = snapshot?.project.id ?? null
    const projectStatus = snapshot?.project.status ?? 'active'
    const projectTitle = snapshot?.project.title
    const importBlockedReason = useMemo(
        () => getBootstrapImportBlockReason(snapshot),
        [snapshot],
    )
    const roleSections = useMemo(
        () => buildRoleCatalogSections(snapshot),
        [snapshot],
    )
    const mutationDisabled = !projectId || projectStatus !== 'active'
    const saveDisabled = !draft?.roleId.trim()
        || !draft.name.trim()
        || mutationDisabled
        || pendingAction !== null

    useEffect(() => {
        if (open || !fileInputRef.current) {
            return
        }

        fileInputRef.current.value = ''
        setDraft(null)
        setPendingAction(null)
        setError(null)
    }, [open])

    const handleCreateFromPrototype = useCallback((prototype: TeamRoleDefinition['prototype']) => {
        setDraft(createTeamRoleDraft(snapshot, prototype))
        setError(null)
    }, [snapshot])

    const handleCreateRole = useCallback(() => {
        handleCreateFromPrototype('implementer')
    }, [handleCreateFromPrototype])

    const handleEditRole = useCallback((role: TeamRoleDefinition) => {
        setDraft(createTeamRoleDraftFromRole(role))
        setError(null)
    }, [])

    const handleDraftChange = useCallback((change: Partial<TeamRoleDraft>) => {
        setDraft((current) => current ? { ...current, ...change } : current)
    }, [])

    const handleSave = useCallback(async () => {
        if (!draft || !projectId) {
            return
        }

        setPendingAction('save')
        setError(null)
        try {
            if (draft.mode === 'create') {
                await api.createTeamRole(projectId, {
                    managerSessionId,
                    roleId: draft.roleId,
                    prototype: draft.prototype,
                    name: draft.name,
                    promptExtension: draft.promptExtension.trim() || null,
                    providerFlavor: draft.providerFlavor,
                    model: draft.model.trim() || null,
                    reasoningEffort: draft.reasoningEffort || null,
                    isolationMode: draft.isolationMode,
                })
            } else {
                await api.updateTeamRole(projectId, draft.roleId, {
                    managerSessionId,
                    name: draft.name,
                    promptExtension: draft.promptExtension.trim() || null,
                    providerFlavor: draft.providerFlavor,
                    model: draft.model.trim() || null,
                    reasoningEffort: draft.reasoningEffort || null,
                    isolationMode: draft.isolationMode,
                })
            }

            await onSnapshotChanged()
            setDraft(null)
        } catch (mutationError) {
            setError(getRoleMutationErrorMessage(mutationError))
        } finally {
            setPendingAction(null)
        }
    }, [api, draft, managerSessionId, onSnapshotChanged, projectId])

    const handleDeleteRole = useCallback(async (roleId: string) => {
        if (!projectId || !window.confirm('删除后会直接移除这个 custom role。继续吗？')) {
            return
        }

        setPendingAction('delete')
        setError(null)
        try {
            await api.deleteTeamRole(projectId, roleId, {
                managerSessionId,
            })
            await onSnapshotChanged()
            setDraft((current) => current?.roleId === roleId ? null : current)
        } catch (mutationError) {
            setError(getRoleMutationErrorMessage(mutationError))
        } finally {
            setPendingAction(null)
        }
    }, [api, managerSessionId, onSnapshotChanged, projectId])

    const handleExportPreset = useCallback(async () => {
        if (!projectId) {
            return
        }

        setPendingAction('export')
        setError(null)
        try {
            const preset = await api.getTeamProjectPreset(projectId)
            downloadTeamProjectPreset(
                preset,
                buildPresetDownloadName(projectTitle, projectId),
            )
        } catch (mutationError) {
            setError(getPresetMutationErrorMessage(mutationError))
        } finally {
            setPendingAction(null)
        }
    }, [api, projectId, projectTitle])

    const handleImportPreset = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleImportFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file || !projectId || importBlockedReason) {
            return
        }

        setPendingAction('import')
        setError(null)
        try {
            const preset = await parseTeamProjectPresetFile(file)
            await api.applyTeamProjectPreset(projectId, {
                managerSessionId,
                preset,
            })
            await onSnapshotChanged()
            setDraft(null)
        } catch (mutationError) {
            setError(getPresetMutationErrorMessage(mutationError))
        } finally {
            setPendingAction(null)
        }
    }, [api, importBlockedReason, managerSessionId, onSnapshotChanged, projectId])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl overflow-hidden p-0">
                <DialogHeader className="border-b border-[var(--ds-border-default)] px-6 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <SettingsIcon className="h-4 w-4 text-[var(--ds-brand)]" />
                        Role Catalog & Preset
                    </DialogTitle>
                    <DialogDescription>
                        管理 custom roles，并把项目设置 + custom role catalog 作为 bootstrap preset 导入导出。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid max-h-[78vh] gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.35fr)_340px]">
                    <TeamRoleCatalogPanel
                        state={{
                            projectId,
                            sections: roleSections,
                            error,
                            importBlockedReason,
                            mutationDisabled,
                            pendingAction,
                        }}
                        actions={{
                            onExportPreset: () => {
                                void handleExportPreset()
                            },
                            onImportPreset: handleImportPreset,
                            onCreateRole: handleCreateRole,
                            onCreateFromPrototype: handleCreateFromPrototype,
                            onEditRole: handleEditRole,
                            onDeleteRole: (roleId) => {
                                void handleDeleteRole(roleId)
                            },
                            onImportFileChange: (event) => {
                                void handleImportFileChange(event)
                            },
                        }}
                        fileInputRef={fileInputRef}
                    />
                    <TeamRoleEditorPanel
                        state={{
                            draft,
                            mutationDisabled,
                            pendingAction,
                            saveDisabled,
                        }}
                        actions={{
                            onDraftChange: handleDraftChange,
                            onCancel: () => setDraft(null),
                            onSave: () => {
                                void handleSave()
                            },
                        }}
                    />
                </div>
            </DialogContent>
        </Dialog>
    )
}
