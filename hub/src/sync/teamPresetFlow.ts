import { TEAM_PRESET_SCHEMA_VERSION } from '@viby/protocol'
import type {
    TeamProjectPreset,
    TeamRoleDefinition,
} from '@viby/protocol/types'
import type {
    ExportTeamProjectPresetInput,
    ImportTeamProjectPresetInput,
    TeamProjectActionResult,
} from './teamOrchestrationContracts'
import type { TeamOrchestrationRuntime } from './teamOrchestrationCommon'
import { createTeamEventRecord } from './teamOrchestrationRecords'

const PRESET_UPDATED_FIELDS = ['maxActiveMembers', 'defaultIsolationMode', 'roles'] as const

function buildTeamProjectPreset(snapshot: Awaited<ReturnType<TeamOrchestrationRuntime['contextReader']['requireProjectOwnedByManager']>>): TeamProjectPreset {
    return {
        schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
        projectSettings: {
            maxActiveMembers: snapshot.project.maxActiveMembers,
            defaultIsolationMode: snapshot.project.defaultIsolationMode,
        },
        roles: snapshot.roles
            .filter((role) => role.source === 'custom')
            .map((role) => ({
                id: role.id,
                prototype: role.prototype,
                name: role.name,
                promptExtension: role.promptExtension,
                providerFlavor: role.providerFlavor,
                model: role.model,
                reasoningEffort: role.reasoningEffort,
                isolationMode: role.isolationMode,
            })),
    }
}

function buildPresetImportRoles(
    snapshot: Awaited<ReturnType<TeamOrchestrationRuntime['contextReader']['requireProjectBootstrapImportTarget']>>,
    preset: TeamProjectPreset,
    updatedAt: number,
): TeamRoleDefinition[] {
    const previousCustomRolesById = new Map(
        snapshot.roles
            .filter((role) => role.source === 'custom')
            .map((role) => [role.id, role]),
    )

    return preset.roles.map((role) => {
        const previousRole = previousCustomRolesById.get(role.id)
        return {
            projectId: snapshot.project.id,
            id: role.id,
            source: 'custom',
            prototype: role.prototype,
            name: role.name,
            promptExtension: role.promptExtension,
            providerFlavor: role.providerFlavor,
            model: role.model,
            reasoningEffort: role.reasoningEffort,
            isolationMode: role.isolationMode,
            createdAt: previousRole?.createdAt ?? updatedAt,
            updatedAt,
        }
    })
}

function buildPresetImportPayload(
    snapshot: Awaited<ReturnType<TeamOrchestrationRuntime['contextReader']['requireProjectBootstrapImportTarget']>>,
    preset: TeamProjectPreset,
    importedRoles: TeamRoleDefinition[],
    deletedRoleIds: string[],
): Record<string, unknown> {
    return {
        updatedFields: [...PRESET_UPDATED_FIELDS],
        previousMaxActiveMembers: snapshot.project.maxActiveMembers,
        nextMaxActiveMembers: preset.projectSettings.maxActiveMembers,
        previousDefaultIsolationMode: snapshot.project.defaultIsolationMode,
        nextDefaultIsolationMode: preset.projectSettings.defaultIsolationMode,
        presetImport: {
            schemaVersion: preset.schemaVersion,
            importedRoleIds: importedRoles.map((role) => role.id),
            deletedRoleIds,
        },
    }
}

function isSamePreset(left: TeamProjectPreset, right: TeamProjectPreset): boolean {
    return JSON.stringify(left) === JSON.stringify(right)
}

export async function exportProjectPreset(
    runtime: TeamOrchestrationRuntime,
    input: ExportTeamProjectPresetInput,
): Promise<TeamProjectPreset> {
    const snapshot = runtime.contextReader.requireProjectOwnedByManager(
        input.projectId,
        input.managerSessionId,
    )
    return buildTeamProjectPreset(snapshot)
}

export async function importProjectPreset(
    runtime: TeamOrchestrationRuntime,
    input: ImportTeamProjectPresetInput,
): Promise<TeamProjectActionResult> {
    const snapshot = runtime.contextReader.requireProjectBootstrapImportTarget(
        input.projectId,
        input.managerSessionId,
    )
    const previousPreset = buildTeamProjectPreset(snapshot)
    if (isSamePreset(previousPreset, input.preset)) {
        return {
            project: snapshot.project,
            snapshot,
        }
    }

    const updatedAt = Date.now()
    const importedRoles = buildPresetImportRoles(snapshot, input.preset, updatedAt)
    const importedRoleIds = new Set(importedRoles.map((role) => role.id))
    const deletedRoleIds = snapshot.roles
        .filter((role) => role.source === 'custom' && !importedRoleIds.has(role.id))
        .map((role) => role.id)
    const nextProject = {
        ...snapshot.project,
        maxActiveMembers: input.preset.projectSettings.maxActiveMembers,
        defaultIsolationMode: input.preset.projectSettings.defaultIsolationMode,
        updatedAt,
    }
    const event = createTeamEventRecord(nextProject.id, 'project', {
        kind: 'project-updated',
        actorType: 'manager',
        actorId: input.managerSessionId,
        targetId: nextProject.id,
        payload: buildPresetImportPayload(snapshot, input.preset, importedRoles, deletedRoleIds),
        createdAt: updatedAt,
    })
    const result = runtime.coordinator.applyCommand({
        type: 'batch',
        project: nextProject,
        roles: importedRoles,
        deletedRoleIds,
        events: [event],
        affectedSessionIds: [input.managerSessionId],
    })

    return {
        project: nextProject,
        snapshot: result.snapshot,
    }
}
