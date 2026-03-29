import { basename } from 'node:path'
import type { Session, TeamProject } from '@viby/protocol/types'

export const DEFAULT_MANAGER_PROJECT_TITLE = 'Manager Project'
export const DEFAULT_MANAGER_PROJECT_MAX_ACTIVE_MEMBERS = 6
export const DEFAULT_MANAGER_PROJECT_ISOLATION_MODE: TeamProject['defaultIsolationMode'] = 'hybrid'

export function uniqueSessionIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

export function resolveManagerProjectTitle(metadata: Session['metadata']): string {
    const preferredName = metadata?.name?.trim()
    if (preferredName) {
        return preferredName
    }

    const rootDirectory = metadata?.path?.trim()
    if (rootDirectory) {
        const projectName = basename(rootDirectory)
        if (projectName && projectName !== '.' && projectName !== '/') {
            return projectName
        }
    }

    return DEFAULT_MANAGER_PROJECT_TITLE
}

export function projectsMatch(left: TeamProject, right: TeamProject): boolean {
    return left.id === right.id
        && left.managerSessionId === right.managerSessionId
        && left.machineId === right.machineId
        && left.rootDirectory === right.rootDirectory
        && left.title === right.title
        && left.goal === right.goal
        && left.status === right.status
        && left.maxActiveMembers === right.maxActiveMembers
        && left.defaultIsolationMode === right.defaultIsolationMode
        && left.createdAt === right.createdAt
        && left.deliveredAt === right.deliveredAt
        && left.archivedAt === right.archivedAt
}
