import {
    AGENT_FLAVORS,
    MODEL_REASONING_EFFORTS,
    TEAM_BUILTIN_ROLE_DEFAULTS,
    TEAM_MEMBER_ROLE_PROTOTYPES,
    TeamProjectPresetSchema,
} from '@viby/protocol'
import type {
    TeamMemberIsolationMode,
    TeamMemberRolePrototype,
    TeamProjectPreset,
    TeamProjectSnapshot,
    TeamProviderFlavor,
    TeamReasoningEffort,
    TeamRoleDefinition,
} from '@/types/api'

const TEAM_ROLE_CATALOG_SOURCES = ['builtin', 'custom'] as const

export type TeamRoleDraft = {
    mode: 'create' | 'edit'
    roleId: string
    prototype: TeamMemberRolePrototype
    name: string
    promptExtension: string
    providerFlavor: TeamProviderFlavor
    model: string
    reasoningEffort: TeamReasoningEffort | ''
    isolationMode: TeamMemberIsolationMode
}

export type TeamRoleManagerPendingAction = 'save' | 'delete' | 'export' | 'import'

export type TeamRoleCatalogSection = {
    source: TeamRoleDefinition['source']
    roles: TeamRoleDefinition[]
}

export const TEAM_ROLE_PROTOTYPE_OPTIONS = [...TEAM_MEMBER_ROLE_PROTOTYPES]
export const TEAM_PROVIDER_OPTIONS = [...AGENT_FLAVORS]
export const TEAM_REASONING_OPTIONS = [...MODEL_REASONING_EFFORTS]

function getPrototypeDefaults(
    snapshot: TeamProjectSnapshot | null,
    prototype: TeamMemberRolePrototype,
): Pick<TeamRoleDraft, 'providerFlavor' | 'model' | 'reasoningEffort' | 'isolationMode'> {
    const role = snapshot?.roles.find((candidate) => candidate.id === prototype)
    if (role) {
        return {
            providerFlavor: role.providerFlavor,
            model: role.model ?? '',
            reasoningEffort: role.reasoningEffort ?? '',
            isolationMode: role.isolationMode,
        }
    }

    const defaults = TEAM_BUILTIN_ROLE_DEFAULTS[prototype]
    return {
        providerFlavor: defaults.providerFlavor,
        model: '',
        reasoningEffort: '',
        isolationMode: defaults.isolationMode,
    }
}

export function createTeamRoleDraft(
    snapshot: TeamProjectSnapshot | null,
    prototype: TeamMemberRolePrototype = 'implementer',
): TeamRoleDraft {
    const defaults = getPrototypeDefaults(snapshot, prototype)
    return {
        mode: 'create',
        roleId: '',
        prototype,
        name: '',
        promptExtension: '',
        providerFlavor: defaults.providerFlavor,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
        isolationMode: defaults.isolationMode,
    }
}

export function createTeamRoleDraftFromRole(role: TeamRoleDefinition): TeamRoleDraft {
    return {
        mode: 'edit',
        roleId: role.id,
        prototype: role.prototype,
        name: role.name,
        promptExtension: role.promptExtension ?? '',
        providerFlavor: role.providerFlavor,
        model: role.model ?? '',
        reasoningEffort: role.reasoningEffort ?? '',
        isolationMode: role.isolationMode,
    }
}

export function buildRoleCatalogSections(
    snapshot: TeamProjectSnapshot | null,
): TeamRoleCatalogSection[] {
    const roles = snapshot?.roles ?? []
    return TEAM_ROLE_CATALOG_SOURCES.map((source) => ({
        source,
        roles: roles.filter((role) => role.source === source),
    }))
}

export function getRoleCardTitle(role: TeamRoleDefinition): string {
    return role.source === 'custom' ? role.name : role.prototype
}

export function getRoleCardSubtitle(role: TeamRoleDefinition): string {
    const parts = [role.id, role.prototype, role.providerFlavor, role.isolationMode]
    if (role.model) {
        parts.push(role.model)
    }
    if (role.reasoningEffort) {
        parts.push(role.reasoningEffort)
    }
    return parts.join(' · ')
}

export function getRoleCatalogSectionLabel(source: TeamRoleDefinition['source']): string {
    return source === 'builtin' ? 'Built-in Prototypes' : 'Custom Roles'
}

export function getBootstrapImportBlockReason(snapshot: TeamProjectSnapshot | null): string | null {
    if (!snapshot) {
        return null
    }
    if (snapshot.members.length > 0) {
        return '只有在还没有 durable 成员时才能导入 preset。'
    }
    if (snapshot.tasks.length > 0) {
        return '只有在还没有 durable team tasks 时才能导入 preset。'
    }
    return null
}

export function getRoleMutationErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }
    return 'Role catalog update failed.'
}

export function getPresetMutationErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message
    }
    return 'Preset operation failed.'
}

export function buildPresetDownloadName(title: string | null | undefined, projectId: string): string {
    const slug = (title ?? projectId)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return `${slug || projectId}-team-preset.json`
}

export function downloadTeamProjectPreset(
    preset: TeamProjectPreset,
    downloadName: string,
): void {
    const blob = new Blob([JSON.stringify(preset, null, 2)], {
        type: 'application/json',
    })
    const objectUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = downloadName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(objectUrl)
}

export async function parseTeamProjectPresetFile(file: File): Promise<TeamProjectPreset> {
    const content = await file.text()
    const parsed = JSON.parse(content) as unknown
    return TeamProjectPresetSchema.parse(parsed)
}
