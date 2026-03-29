import type { TeamRoleDefinition } from '@viby/protocol/types'
import { TEAM_MEMBER_ROLE_PROTOTYPES } from '@viby/protocol'
import type {
    CreateTeamRoleInput,
    DeleteTeamRoleInput,
    TeamRoleActionResult,
    TeamRoleDeleteResult,
    UpdateTeamRoleInput,
} from './teamOrchestrationContracts'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import type { TeamOrchestrationRuntime } from './teamOrchestrationCommon'
import { normalizeOptionalText } from './teamOrchestrationMessages'
import { createTeamEventRecord } from './teamOrchestrationRecords'

const RESERVED_ROLE_IDS = new Set<string>(TEAM_MEMBER_ROLE_PROTOTYPES)
const ROLE_EVENT_FIELDS = ['roles'] as const

type RoleCatalogAction = 'created' | 'updated' | 'deleted'

type RoleMutationDefaults = Pick<
    TeamRoleDefinition,
    'providerFlavor' | 'model' | 'reasoningEffort' | 'isolationMode'
>

function getPrototypeDefaults(
    runtime: TeamOrchestrationRuntime,
    projectId: string,
    managerSessionId: string,
    prototype: CreateTeamRoleInput['prototype']
): RoleMutationDefaults {
    const role = runtime.contextReader.requireProjectRole(projectId, managerSessionId, prototype)
    return {
        providerFlavor: role.providerFlavor,
        model: role.model,
        reasoningEffort: role.reasoningEffort,
        isolationMode: role.isolationMode,
    }
}

function buildRoleCatalogEvent(
    runtime: TeamOrchestrationRuntime,
    projectId: string,
    managerSessionId: string,
    action: RoleCatalogAction,
    roleId: string,
    previousRole: TeamRoleDefinition | null,
    nextRole: TeamRoleDefinition | null,
    createdAt: number,
) {
    return createTeamEventRecord(projectId, 'project', {
        kind: 'project-updated',
        actorType: 'manager',
        actorId: managerSessionId,
        targetId: projectId,
        payload: {
            updatedFields: [...ROLE_EVENT_FIELDS],
            roleCatalogAction: action,
            roleId,
            previousRole,
            nextRole,
        },
        createdAt,
    })
}

function buildCustomRoleDefinition(
    runtime: TeamOrchestrationRuntime,
    snapshot: ReturnType<TeamOrchestrationRuntime['contextReader']['requireActiveProjectOwnedByManager']>,
    input: CreateTeamRoleInput,
): TeamRoleDefinition {
    if (RESERVED_ROLE_IDS.has(input.roleId)) {
        throw new TeamOrchestrationError(
            'Built-in team role ids are reserved',
            'team_role_reserved',
            409,
        )
    }
    if (snapshot.roles.some((role) => role.id === input.roleId)) {
        throw new TeamOrchestrationError(
            'Team role already exists',
            'team_role_exists',
            409,
        )
    }

    const defaults = getPrototypeDefaults(
        runtime,
        snapshot.project.id,
        input.managerSessionId,
        input.prototype,
    )
    const now = Date.now()

    return {
        projectId: snapshot.project.id,
        id: input.roleId,
        source: 'custom',
        prototype: input.prototype,
        name: input.name.trim(),
        promptExtension: normalizeOptionalText(input.promptExtension),
        providerFlavor: input.providerFlavor ?? defaults.providerFlavor,
        model: input.model === undefined ? defaults.model : normalizeOptionalText(input.model),
        reasoningEffort: input.reasoningEffort === undefined
            ? defaults.reasoningEffort
            : input.reasoningEffort,
        isolationMode: input.isolationMode ?? defaults.isolationMode,
        createdAt: now,
        updatedAt: now,
    }
}

export async function createRole(
    runtime: TeamOrchestrationRuntime,
    input: CreateTeamRoleInput,
): Promise<TeamRoleActionResult> {
    const snapshot = runtime.contextReader.requireActiveProjectOwnedByManager(
        input.projectId,
        input.managerSessionId,
    )
    const role = buildCustomRoleDefinition(runtime, snapshot, input)
    const result = runtime.coordinator.applyCommand({
        type: 'upsert-role',
        role,
        event: buildRoleCatalogEvent(
            runtime,
            snapshot.project.id,
            input.managerSessionId,
            'created',
            role.id,
            null,
            role,
            role.createdAt,
        ),
    })

    return {
        role,
        snapshot: result.snapshot,
    }
}

export async function updateRole(
    runtime: TeamOrchestrationRuntime,
    input: UpdateTeamRoleInput,
): Promise<TeamRoleActionResult> {
    const currentRole = runtime.contextReader.requireCustomRole(
        input.projectId,
        input.managerSessionId,
        input.roleId,
    )
    const nextRole: TeamRoleDefinition = {
        ...currentRole,
        name: input.name?.trim() ?? currentRole.name,
        promptExtension: input.promptExtension === undefined
            ? currentRole.promptExtension
            : normalizeOptionalText(input.promptExtension),
        providerFlavor: input.providerFlavor ?? currentRole.providerFlavor,
        model: input.model === undefined ? currentRole.model : normalizeOptionalText(input.model),
        reasoningEffort: input.reasoningEffort === undefined
            ? currentRole.reasoningEffort
            : input.reasoningEffort,
        isolationMode: input.isolationMode ?? currentRole.isolationMode,
        updatedAt: Date.now(),
    }
    const result = runtime.coordinator.applyCommand({
        type: 'upsert-role',
        role: nextRole,
        event: buildRoleCatalogEvent(
            runtime,
            input.projectId,
            input.managerSessionId,
            'updated',
            nextRole.id,
            currentRole,
            nextRole,
            nextRole.updatedAt,
        ),
    })

    return {
        role: nextRole,
        snapshot: result.snapshot,
    }
}

export async function deleteRole(
    runtime: TeamOrchestrationRuntime,
    input: DeleteTeamRoleInput,
): Promise<TeamRoleDeleteResult> {
    const role = runtime.contextReader.requireCustomRole(
        input.projectId,
        input.managerSessionId,
        input.roleId,
    )
    const membersUsingRole = runtime.contextReader.listRoleMembers(input.projectId, role.id)
    if (membersUsingRole.length > 0) {
        throw new TeamOrchestrationError(
            'Team role is still referenced by existing member lineage',
            'team_role_in_use',
            409,
        )
    }

    const result = runtime.coordinator.applyCommand({
        type: 'delete-role',
        projectId: input.projectId,
        roleId: role.id,
        event: buildRoleCatalogEvent(
            runtime,
            input.projectId,
            input.managerSessionId,
            'deleted',
            role.id,
            role,
            null,
            Date.now(),
        ),
    })

    return {
        roleId: role.id,
        snapshot: result.snapshot,
    }
}
