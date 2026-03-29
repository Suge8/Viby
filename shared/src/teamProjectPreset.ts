import { z } from 'zod'
import {
    TeamMemberIsolationModeSchema,
    TeamMemberRolePrototypeSchema,
    TeamProjectIsolationModeSchema,
    TeamProviderFlavorSchema,
    TeamReasoningEffortSchema,
    TeamRoleIdSchema,
} from './teamSchemas'
import {
    TEAM_MEMBER_ROLE_PROTOTYPES,
    TEAM_PRESET_SCHEMA_VERSION,
} from './teamRoleDefaults'

const RESERVED_PRESET_ROLE_IDS = new Set<string>(TEAM_MEMBER_ROLE_PROTOTYPES)

export const TeamProjectPresetProjectSettingsSchema = z.object({
    maxActiveMembers: z.number().int().positive(),
    defaultIsolationMode: TeamProjectIsolationModeSchema,
})

export type TeamProjectPresetProjectSettings = z.infer<typeof TeamProjectPresetProjectSettingsSchema>

export const TeamProjectPresetRoleSchema = z.object({
    id: TeamRoleIdSchema,
    prototype: TeamMemberRolePrototypeSchema,
    name: z.string().trim().min(1),
    promptExtension: z.string().trim().min(1).nullable(),
    providerFlavor: TeamProviderFlavorSchema,
    model: z.string().trim().min(1).nullable(),
    reasoningEffort: TeamReasoningEffortSchema.nullable(),
    isolationMode: TeamMemberIsolationModeSchema,
}).refine((role) => !RESERVED_PRESET_ROLE_IDS.has(role.id), {
    message: 'Preset custom role ids must not reuse built-in prototypes',
    path: ['id'],
})

export type TeamProjectPresetRole = z.infer<typeof TeamProjectPresetRoleSchema>

export const TeamProjectPresetSchema = z.object({
    schemaVersion: z.literal(TEAM_PRESET_SCHEMA_VERSION),
    projectSettings: TeamProjectPresetProjectSettingsSchema,
    roles: z.array(TeamProjectPresetRoleSchema),
}).superRefine((preset, context) => {
    const seenRoleIds = new Set<string>()
    for (const [index, role] of preset.roles.entries()) {
        if (seenRoleIds.has(role.id)) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Preset custom role ids must be unique',
                path: ['roles', index, 'id'],
            })
        }
        seenRoleIds.add(role.id)
    }
})

export type TeamProjectPreset = z.infer<typeof TeamProjectPresetSchema>
