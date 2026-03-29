import {
    TEAM_PROJECT_COMPACT_ACCEPTANCE_LIMIT,
    TEAM_PROJECT_COMPACT_EVENT_LIMIT,
    TEAM_PROJECT_COMPACT_INACTIVE_MEMBER_LIMIT,
    TEAM_PROJECT_COMPACT_MEMBER_LIMIT,
    TEAM_PROJECT_COMPACT_TASK_LIMIT,
} from '@viby/protocol'
import type { TeamProjectCompactBrief } from '@viby/protocol/types'
import {
    buildCompactEvent,
    buildCompactMember,
    buildCompactTask,
    buildMemberMap,
    buildRoleNameMap,
    buildSummary,
    buildTaskMap,
    collectOpenTasksAndCounts,
    takeMostRecentCreated,
    type TeamProjectCompactBriefSource,
} from './teamProjectCompactBriefSupport'
import { buildNextActions, buildWakeReasons } from './teamProjectWakeSignals'

export function buildTeamProjectCompactBrief(source: TeamProjectCompactBriefSource): TeamProjectCompactBrief {
    const roleNames = buildRoleNameMap(source.roles)
    const membersById = buildMemberMap(source.members)
    const tasksById = buildTaskMap(source.tasks)
    const activeMembers = source.members.filter((member) => member.membershipState === 'active')
    const inactiveMembers = source.members.filter((member) => member.membershipState !== 'active')
    const { openTasks, counts } = collectOpenTasksAndCounts(source)
    const wakeReasons = buildWakeReasons(source, roleNames)
    const nextActions = buildNextActions({
        tasks: openTasks,
        acceptance: source.acceptance,
        staffing: source.staffing,
        wakeReasons
    })

    return {
        project: {
            id: source.project.id,
            title: source.project.title,
            goal: source.project.goal,
            status: source.project.status,
            maxActiveMembers: source.project.maxActiveMembers,
            defaultIsolationMode: source.project.defaultIsolationMode,
            updatedAt: source.project.updatedAt,
            deliveredAt: source.project.deliveredAt
        },
        summary: buildSummary(source.project, counts),
        counts,
        staffing: source.staffing,
        activeMembers: activeMembers.slice(0, TEAM_PROJECT_COMPACT_MEMBER_LIMIT).map((member) => buildCompactMember(member, roleNames)),
        inactiveMembers: inactiveMembers.slice(0, TEAM_PROJECT_COMPACT_INACTIVE_MEMBER_LIMIT).map((member) => buildCompactMember(member, roleNames)),
        openTasks: openTasks.slice(0, TEAM_PROJECT_COMPACT_TASK_LIMIT).map((task) => buildCompactTask(task, source.acceptance)),
        recentEvents: takeMostRecentCreated(source.events, TEAM_PROJECT_COMPACT_EVENT_LIMIT)
            .map((event) => buildCompactEvent(event, tasksById, membersById, roleNames)),
        recentAcceptanceResults: source.acceptance.recentResults
            .slice(0, TEAM_PROJECT_COMPACT_ACCEPTANCE_LIMIT)
            .map((event) => buildCompactEvent(event, tasksById, membersById, roleNames)),
        wakeReasons,
        nextActions
    }
}
