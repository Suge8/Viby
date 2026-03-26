import type {
    MessageMeta,
    TeamControlOwner,
    TeamMessageKind,
} from '@viby/protocol/types'
import type { Store } from '../store'
import {
    buildRevisionCarryoverBrief,
    canResumeCandidate,
    compareLaunchCandidates,
    parseLaunchSession,
    REUSABLE_MEMBER_STATES,
    resolveRevisionReason,
    type InactiveTeamMemberLaunchCandidate,
    type InactiveTeamMemberLaunchPlan,
    type InactiveTeamMemberLaunchRequest,
    type RevisionCarryoverBriefInput,
    type TeamMemberLaunchRole
} from './teamMemberSessionPolicy'

export type {
    InactiveTeamMemberLaunchCandidate,
    InactiveTeamMemberLaunchPlan,
    InactiveTeamMemberLaunchReason,
    InactiveTeamMemberLaunchRequest,
    RevisionCarryoverBriefInput,
    TeamMemberLaunchRole
} from './teamMemberSessionPolicy'
export { buildRevisionCarryoverBrief } from './teamMemberSessionPolicy'

export type RevisionCarryoverMessageInput = RevisionCarryoverBriefInput & {
    projectId: string
    managerSessionId: string
    memberId: string
    controlOwner?: TeamControlOwner
    teamMessageKind?: TeamMessageKind
}

const DEFAULT_TEAM_MESSAGE_KIND: TeamMessageKind = 'coordination'
const DEFAULT_CONTROL_OWNER: TeamControlOwner = 'manager'

export class TeamMemberSessionService {
    constructor(private readonly store: Store) {
    }

    planInactiveLaunch(request: InactiveTeamMemberLaunchRequest): InactiveTeamMemberLaunchPlan {
        const candidates = this.listInactiveCandidates(request.projectId, request.role)
        const resumeCandidate = candidates.find((candidate) => canResumeCandidate(candidate, request))
        if (resumeCandidate) {
            return {
                strategy: 'resume',
                reason: 'resume_supported',
                candidate: resumeCandidate
            }
        }

        const latestCandidate = candidates[0]
        if (!latestCandidate) {
            return {
                strategy: 'spawn',
                reason: 'no_prior_member',
                candidate: null
            }
        }

        return {
            strategy: 'revision',
            reason: resolveRevisionReason(latestCandidate, request),
            candidate: latestCandidate
        }
    }

    buildRevisionCarryoverMessage(input: RevisionCarryoverMessageInput): {
        text: string
        meta: MessageMeta
    } {
        const brief = buildRevisionCarryoverBrief(input)

        return {
            text: brief,
            meta: {
                sentFrom: 'manager',
                teamProjectId: input.projectId,
                managerSessionId: input.managerSessionId,
                memberId: input.memberId,
                sessionRole: 'member',
                teamMessageKind: input.teamMessageKind ?? DEFAULT_TEAM_MESSAGE_KIND,
                controlOwner: input.controlOwner ?? DEFAULT_CONTROL_OWNER
            }
        }
    }

    private listInactiveCandidates(
        projectId: string,
        role: TeamMemberLaunchRole
    ): InactiveTeamMemberLaunchCandidate[] {
        return this.store.teams
            .listProjectMembers(projectId)
            .filter((member) =>
                member.role === role
                && REUSABLE_MEMBER_STATES.has(member.membershipState)
            )
            .map((member) => ({
                member,
                session: parseLaunchSession(this.store.sessions.getSession(member.sessionId))
            }))
            .filter((candidate) => candidate.session?.active !== true)
            .sort(compareLaunchCandidates)
    }
}
