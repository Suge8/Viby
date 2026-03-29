import { buildProjectAcceptanceReadModel } from '@viby/protocol'
import type { TeamProjectSnapshot } from '@viby/protocol/types'
import type { Store } from '../store'
import { TeamMemberSessionService } from './teamMemberSessionService'
import { buildTeamProjectCompactBrief } from './teamProjectCompactBriefBuilder'

export function buildTeamProjectSnapshot(store: Store, projectId: string): TeamProjectSnapshot | null {
    const project = store.teams.getProject(projectId)
    if (!project) {
        return null
    }

    const roles = store.teams.listProjectRoles(projectId)
    const members = store.teams.listProjectMembers(projectId)
    const tasks = store.teams.listProjectTasks(projectId)
    const events = store.teams.listProjectEvents(projectId)
    const acceptanceEvents = store.teams.listProjectAcceptanceEvents(projectId)
    const acceptance = buildProjectAcceptanceReadModel(tasks, acceptanceEvents)
    const memberSessionService = new TeamMemberSessionService(store)
    const staffing = memberSessionService.buildProjectStaffing({
        project,
        roles,
        members,
        tasks
    })

    return {
        project,
        roles,
        members,
        tasks,
        events,
        acceptance,
        compactBrief: buildTeamProjectCompactBrief({
            project,
            roles,
            members,
            tasks,
            events,
            acceptance,
            staffing
        })
    }
}
