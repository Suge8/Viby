import type { SessionTeamContext } from '@viby/protocol/types'
import {
    executeChangeTitle,
    executeTeamAcceptTask,
    executeTeamCloseProject,
    executeTeamCreateRole,
    executeTeamCreateTask,
    executeTeamDeleteRole,
    executeTeamGetSnapshot,
    executeTeamMessageMember,
    executeTeamRequestReview,
    executeTeamRequestVerification,
    executeTeamSpawnMember,
    executeTeamSubmitReviewResult,
    executeTeamSubmitVerificationResult,
    executeTeamUpdateMember,
    executeTeamUpdateRole,
    executeTeamUpdateTask
} from './vibyToolExecutors'
import {
    ACCEPT_TASK_INPUT_SCHEMA,
    CHANGE_TITLE_INPUT_SCHEMA,
    CLOSE_PROJECT_INPUT_SCHEMA,
    CREATE_ROLE_INPUT_SCHEMA,
    CREATE_TASK_INPUT_SCHEMA,
    DELETE_ROLE_INPUT_SCHEMA,
    EMPTY_INPUT_SCHEMA,
    MESSAGE_MEMBER_INPUT_SCHEMA,
    REVIEW_REQUEST_INPUT_SCHEMA,
    REVIEW_RESULT_INPUT_SCHEMA,
    SPAWN_MEMBER_INPUT_SCHEMA,
    UPDATE_MEMBER_INPUT_SCHEMA,
    UPDATE_ROLE_INPUT_SCHEMA,
    UPDATE_TASK_INPUT_SCHEMA,
    VERIFICATION_REQUEST_INPUT_SCHEMA,
    VERIFICATION_RESULT_INPUT_SCHEMA
} from './vibyToolSchemas'
import {
    type AnyVibyToolDefinition,
    createToolDefinition,
    isActiveManagerSession,
    isMemberSessionWithRole,
    isTeamSession
} from './vibyToolSupport'

const VIBY_TOOL_DEFINITIONS = [
    createToolDefinition({
        name: 'change_title',
        title: 'Change Chat Title',
        description: 'Change the title of the current chat session',
        inputSchema: CHANGE_TITLE_INPUT_SCHEMA,
        isEnabled: () => true,
        execute: executeChangeTitle
    }),
    createToolDefinition({
        name: 'team_get_snapshot',
        title: 'Get Team Snapshot',
        description: 'Fetch the authoritative team project snapshot for the current manager-teams session',
        inputSchema: EMPTY_INPUT_SCHEMA,
        isEnabled: isTeamSession,
        execute: executeTeamGetSnapshot
    }),
    createToolDefinition({
        name: 'team_spawn_member',
        title: 'Spawn Team Member',
        description: 'Recruit, resume, or revise a member for the current manager-teams project',
        inputSchema: SPAWN_MEMBER_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamSpawnMember
    }),
    createToolDefinition({
        name: 'team_create_role',
        title: 'Create Team Role',
        description: 'Create a custom authoritative role in the current manager-teams project',
        inputSchema: CREATE_ROLE_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamCreateRole
    }),
    createToolDefinition({
        name: 'team_update_role',
        title: 'Update Team Role',
        description: 'Patch a custom authoritative role in the current manager-teams project',
        inputSchema: UPDATE_ROLE_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamUpdateRole
    }),
    createToolDefinition({
        name: 'team_delete_role',
        title: 'Delete Team Role',
        description: 'Delete an unused custom authoritative role from the current manager-teams project',
        inputSchema: DELETE_ROLE_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamDeleteRole
    }),
    createToolDefinition({
        name: 'team_update_member',
        title: 'Update Team Member',
        description: 'Remove a member from the roster or replace the lineage with a fresh revision',
        inputSchema: UPDATE_MEMBER_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamUpdateMember
    }),
    createToolDefinition({
        name: 'team_create_task',
        title: 'Create Team Task',
        description: 'Create a durable task in the current manager-teams project',
        inputSchema: CREATE_TASK_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamCreateTask
    }),
    createToolDefinition({
        name: 'team_update_task',
        title: 'Update Team Task',
        description: 'Patch the durable task state, assignment, and metadata for the current project',
        inputSchema: UPDATE_TASK_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamUpdateTask
    }),
    createToolDefinition({
        name: 'team_message_member',
        title: 'Message Team Member',
        description: 'Append a manager-owned message into a manager-controlled member transcript',
        inputSchema: MESSAGE_MEMBER_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamMessageMember
    }),
    createToolDefinition({
        name: 'team_request_review',
        title: 'Request Team Review',
        description: 'Ask a reviewer member to review a team task',
        inputSchema: REVIEW_REQUEST_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamRequestReview
    }),
    createToolDefinition({
        name: 'team_submit_review_result',
        title: 'Submit Review Result',
        description: 'Submit the current reviewer member decision for a team task',
        inputSchema: REVIEW_RESULT_INPUT_SCHEMA,
        isEnabled: (teamContext?: SessionTeamContext) => isMemberSessionWithRole(teamContext, 'reviewer'),
        execute: executeTeamSubmitReviewResult
    }),
    createToolDefinition({
        name: 'team_request_verification',
        title: 'Request Team Verification',
        description: 'Ask a verifier member to run verification for a team task',
        inputSchema: VERIFICATION_REQUEST_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamRequestVerification
    }),
    createToolDefinition({
        name: 'team_submit_verification_result',
        title: 'Submit Verification Result',
        description: 'Submit the current verifier member decision for a team task',
        inputSchema: VERIFICATION_RESULT_INPUT_SCHEMA,
        isEnabled: (teamContext?: SessionTeamContext) => isMemberSessionWithRole(teamContext, 'verifier'),
        execute: executeTeamSubmitVerificationResult
    }),
    createToolDefinition({
        name: 'team_accept_task',
        title: 'Accept Team Task',
        description: 'Mark a team task as finally accepted by the manager',
        inputSchema: ACCEPT_TASK_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamAcceptTask
    }),
    createToolDefinition({
        name: 'team_close_project',
        title: 'Close Team Project',
        description: 'Mark the current manager-teams project as delivered after final orchestration',
        inputSchema: CLOSE_PROJECT_INPUT_SCHEMA,
        isEnabled: isActiveManagerSession,
        execute: executeTeamCloseProject
    })
] as const satisfies readonly AnyVibyToolDefinition[]

export function getEnabledVibyToolDefinitions(
    teamContext?: SessionTeamContext
): AnyVibyToolDefinition[] {
    return VIBY_TOOL_DEFINITIONS.filter((definition) => definition.isEnabled(teamContext))
}

export function getVibyToolDefinitionsByName(
    toolNames: readonly string[]
): AnyVibyToolDefinition[] {
    const toolNameSet = new Set(toolNames)
    return VIBY_TOOL_DEFINITIONS.filter((definition) => toolNameSet.has(definition.name))
}

export type {
    AnyVibyToolDefinition,
    VibyToolDefinition,
    VibyToolExecutionContext
} from './vibyToolSupport'
export { createToolErrorResult } from './vibyToolResults'
export type { VibyToolResult } from './vibyToolResults'
