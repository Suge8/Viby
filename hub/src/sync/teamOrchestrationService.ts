import type { TeamProjectPreset } from '@viby/protocol/types'
import type { Store } from '../store'
import { TeamCoordinatorService } from './teamCoordinatorService'
import {
    createTeamOrchestrationRuntime,
    type AppendMessage,
    type GetSession,
    type SpawnSession,
    type TeamOrchestrationRuntime
} from './teamOrchestrationCommon'
import { updateProjectSettings, closeProject } from './teamOrchestrationProjectFlow'
import { exportProjectPreset, importProjectPreset } from './teamPresetFlow'
import { createRole, deleteRole, updateRole } from './teamOrchestrationRoleFlow'
import { createTask, updateTask } from './teamOrchestrationTaskFlow'
import { TeamLifecycleService } from './teamLifecycleService'
import { TeamMemberSessionService } from './teamMemberSessionService'
import {
    messageMember,
    spawnMember,
    updateMember
} from './teamOrchestrationMemberFlow'
import type {
    CloseTeamProjectInput,
    CreateTeamRoleInput,
    CreateTeamTaskInput,
    DeleteTeamRoleInput,
    ExportTeamProjectPresetInput,
    ImportTeamProjectPresetInput,
    MessageTeamMemberInput,
    SpawnTeamMemberInput,
    TeamMemberActionResult,
    TeamMemberUpdateResult,
    TeamProjectActionResult,
    TeamRoleActionResult,
    TeamRoleDeleteResult,
    TeamTaskActionResult,
    UpdateTeamProjectSettingsInput,
    UpdateTeamMemberInput,
    UpdateTeamRoleInput,
    UpdateTeamTaskInput
} from './teamOrchestrationContracts'

export class TeamOrchestrationService {
    private readonly runtime: TeamOrchestrationRuntime

    constructor(
        store: Store,
        coordinator: TeamCoordinatorService,
        memberSessionService: TeamMemberSessionService,
        lifecycleService: TeamLifecycleService,
        spawnSession: SpawnSession,
        appendInternalUserMessage: AppendMessage,
        getSession: GetSession
    ) {
        this.runtime = createTeamOrchestrationRuntime({
            store,
            coordinator,
            memberSessionService,
            lifecycleService,
            spawnSession,
            appendInternalUserMessage,
            getSession
        })
    }

    async spawnMember(input: SpawnTeamMemberInput): Promise<TeamMemberActionResult> {
        return await spawnMember(this.runtime, input)
    }

    async updateMember(input: UpdateTeamMemberInput): Promise<TeamMemberUpdateResult> {
        return await updateMember(this.runtime, input)
    }

    async exportProjectPreset(input: ExportTeamProjectPresetInput): Promise<TeamProjectPreset> {
        return await exportProjectPreset(this.runtime, input)
    }

    async importProjectPreset(input: ImportTeamProjectPresetInput): Promise<TeamProjectActionResult> {
        return await importProjectPreset(this.runtime, input)
    }

    async createRole(input: CreateTeamRoleInput): Promise<TeamRoleActionResult> {
        return await createRole(this.runtime, input)
    }

    async updateRole(input: UpdateTeamRoleInput): Promise<TeamRoleActionResult> {
        return await updateRole(this.runtime, input)
    }

    async deleteRole(input: DeleteTeamRoleInput): Promise<TeamRoleDeleteResult> {
        return await deleteRole(this.runtime, input)
    }

    async createTask(input: CreateTeamTaskInput): Promise<TeamTaskActionResult> {
        return await createTask(this.runtime, input)
    }

    async updateProjectSettings(input: UpdateTeamProjectSettingsInput): Promise<TeamProjectActionResult> {
        return await updateProjectSettings(this.runtime, input)
    }

    async updateTask(input: UpdateTeamTaskInput): Promise<TeamTaskActionResult> {
        return await updateTask(this.runtime, input)
    }

    async messageMember(input: MessageTeamMemberInput): Promise<TeamMemberActionResult> {
        return await messageMember(this.runtime, input)
    }

    async closeProject(input: CloseTeamProjectInput): Promise<TeamProjectActionResult> {
        return await closeProject(this.runtime, input)
    }
}

export {
    TeamOrchestrationError,
    type CloseTeamProjectInput,
    type CreateTeamRoleInput,
    type CreateTeamTaskInput,
    type DeleteTeamRoleInput,
    type ExportTeamProjectPresetInput,
    type ImportTeamProjectPresetInput,
    type MessageTeamMemberInput,
    type SpawnTeamMemberInput,
    type TeamMemberActionResult,
    type TeamMemberUpdateResult,
    type TeamProjectActionResult,
    type TeamRoleActionResult,
    type TeamRoleDeleteResult,
    type TeamTaskActionResult,
    type UpdateTeamProjectSettingsInput,
    type UpdateTeamMemberInput,
    type UpdateTeamRoleInput,
    type UpdateTeamTaskInput
} from './teamOrchestrationContracts'
