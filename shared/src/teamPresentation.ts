export type TeamRoleDisplayOptions = {
    roleName?: string | null
    showPrototypeHint?: boolean
}

export function getTeamRoleDisplayName(
    role: string,
    options: TeamRoleDisplayOptions = {}
): string {
    const roleName = options.roleName?.trim()
    if (!roleName) {
        return role
    }

    if (options.showPrototypeHint && roleName !== role) {
        return `${roleName} (${role})`
    }

    return roleName
}
