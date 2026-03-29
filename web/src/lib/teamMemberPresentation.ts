import { getTeamRoleDisplayName } from '@viby/protocol'
import type {
    TeamMemberRecord,
    TeamRoleDefinition,
} from '@/types/api'

type TeamRoleCatalog = ReadonlyMap<string, TeamRoleDefinition>

export function buildTeamRoleCatalog(roles: readonly TeamRoleDefinition[]): TeamRoleCatalog {
    return new Map(roles.map((role) => [role.id, role]))
}

export function getTeamMemberRoleLabel(
    member: Pick<TeamMemberRecord, 'role' | 'roleId'>,
    roleCatalog: TeamRoleCatalog,
): string {
    const role = roleCatalog.get(member.roleId)
    return getTeamRoleDisplayName(member.role, {
        roleName: role?.name,
        showPrototypeHint: role?.source === 'custom'
    })
}

export function getTeamMemberLabel(
    member: Pick<TeamMemberRecord, 'role' | 'roleId' | 'revision'>,
    roleCatalog: TeamRoleCatalog,
): string {
    return `${getTeamMemberRoleLabel(member, roleCatalog)} · r${member.revision}`
}

export function buildTeamMemberLabelMap(
    members: readonly TeamMemberRecord[],
    roleCatalog: TeamRoleCatalog,
): ReadonlyMap<string, string> {
    return new Map(members.map((member) => [member.id, getTeamMemberLabel(member, roleCatalog)]))
}
