import { getSessionResumeToken } from '@viby/protocol'
import { MetadataSchema } from '@viby/protocol/schemas'
import type {
    Session,
    TeamMemberIsolationMode,
    TeamMemberRecord,
    TeamProviderFlavor,
    TeamRolePrototype
} from '@viby/protocol/types'
import type { StoredSession } from '../store'

type InactiveMemberLaunchSession = Pick<Session, 'id' | 'active' | 'metadata'>

export type TeamMemberLaunchRole = Exclude<TeamRolePrototype, 'manager'>

export type InactiveTeamMemberLaunchRequest = {
    projectId: string
    role: TeamMemberLaunchRole
    providerFlavor: TeamProviderFlavor | null
    isolationMode: TeamMemberIsolationMode
    workspaceRoot: string | null
    contextTrusted: boolean
    workspaceTrusted: boolean
    requireFreshPerspective?: boolean
}

export type InactiveTeamMemberLaunchReason =
    | 'no_prior_member'
    | 'resume_supported'
    | 'provider_flavor_changed'
    | 'workspace_semantics_changed'
    | 'workspace_untrusted'
    | 'context_untrusted'
    | 'fresh_perspective_required'
    | 'prior_session_missing'
    | 'resume_token_missing'

export type InactiveTeamMemberLaunchCandidate = {
    member: TeamMemberRecord
    session: InactiveMemberLaunchSession | null
}

export type InactiveTeamMemberLaunchPlan =
    | {
        strategy: 'spawn'
        reason: 'no_prior_member'
        candidate: null
    }
    | {
        strategy: 'resume'
        reason: 'resume_supported'
        candidate: InactiveTeamMemberLaunchCandidate
    }
    | {
        strategy: 'revision'
        reason: Exclude<InactiveTeamMemberLaunchReason, 'no_prior_member' | 'resume_supported'>
        candidate: InactiveTeamMemberLaunchCandidate
    }

export type RevisionCarryoverBriefInput = {
    plan: Extract<InactiveTeamMemberLaunchPlan, { strategy: 'revision' }>
    taskGoal?: string | null
    artifactSummary?: string | null
    attemptSummary?: string | null
    failureSummary?: string | null
    reviewSummary?: string | null
    filePointers?: string[]
}

const REVISION_REASON_LABELS: Record<
    Exclude<InactiveTeamMemberLaunchReason, 'no_prior_member' | 'resume_supported'>,
    string
> = {
    provider_flavor_changed: 'Provider flavor changed, so the old provider resume chain must not be reused.',
    workspace_semantics_changed: 'Workspace semantics changed, so the prior session should not be resumed in place.',
    workspace_untrusted: 'Workspace is no longer trusted for in-place continuation.',
    context_untrusted: 'Previous member context is no longer trusted.',
    fresh_perspective_required: 'Review or verification requested a fresh perspective.',
    prior_session_missing: 'The previous member session snapshot is unavailable.',
    resume_token_missing: 'The previous member no longer has a provider resume token.'
}

export const REUSABLE_MEMBER_STATES = new Set<TeamMemberRecord['membershipState']>([
    'active',
    'archived'
])

function normalizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function normalizePath(value: string | null | undefined): string | null {
    return normalizeOptionalText(value)
}

export function parseLaunchSession(stored: StoredSession | null): InactiveMemberLaunchSession | null {
    if (!stored) {
        return null
    }

    const parsedMetadata = MetadataSchema.safeParse(stored.metadata)
    return {
        id: stored.id,
        active: stored.active,
        metadata: parsedMetadata.success ? parsedMetadata.data : null
    }
}

export function compareLaunchCandidates(
    left: InactiveTeamMemberLaunchCandidate,
    right: InactiveTeamMemberLaunchCandidate
): number {
    if (left.member.revision !== right.member.revision) {
        return right.member.revision - left.member.revision
    }

    if (left.member.updatedAt !== right.member.updatedAt) {
        return right.member.updatedAt - left.member.updatedAt
    }

    if (left.member.createdAt !== right.member.createdAt) {
        return right.member.createdAt - left.member.createdAt
    }

    return left.member.id.localeCompare(right.member.id)
}

export function hasMatchingWorkspaceSemantics(
    member: TeamMemberRecord,
    request: InactiveTeamMemberLaunchRequest
): boolean {
    return member.isolationMode === request.isolationMode
        && normalizePath(member.workspaceRoot) === normalizePath(request.workspaceRoot)
}

export function canResumeCandidate(
    candidate: InactiveTeamMemberLaunchCandidate,
    request: InactiveTeamMemberLaunchRequest
): boolean {
    if (request.requireFreshPerspective) {
        return false
    }

    if (!request.contextTrusted || !request.workspaceTrusted) {
        return false
    }

    if (!candidate.session) {
        return false
    }

    if (candidate.member.providerFlavor !== request.providerFlavor) {
        return false
    }

    if (!hasMatchingWorkspaceSemantics(candidate.member, request)) {
        return false
    }

    return getSessionResumeToken(candidate.session.metadata) !== undefined
}

export function resolveRevisionReason(
    candidate: InactiveTeamMemberLaunchCandidate,
    request: InactiveTeamMemberLaunchRequest
): Exclude<InactiveTeamMemberLaunchReason, 'no_prior_member' | 'resume_supported'> {
    if (request.requireFreshPerspective) {
        return 'fresh_perspective_required'
    }

    if (candidate.member.providerFlavor !== request.providerFlavor) {
        return 'provider_flavor_changed'
    }

    if (!hasMatchingWorkspaceSemantics(candidate.member, request)) {
        return 'workspace_semantics_changed'
    }

    if (!request.workspaceTrusted) {
        return 'workspace_untrusted'
    }

    if (!request.contextTrusted) {
        return 'context_untrusted'
    }

    if (!candidate.session) {
        return 'prior_session_missing'
    }

    return 'resume_token_missing'
}

function buildMemberDescriptor(candidate: InactiveTeamMemberLaunchCandidate): string {
    const provider = candidate.member.providerFlavor ?? 'unknown-provider'
    const model = candidate.member.model ?? 'auto'

    return `${candidate.member.role} rev ${candidate.member.revision} (${provider}, ${model})`
}

function appendSection(lines: string[], title: string, value: string | null | undefined): void {
    const normalizedValue = normalizeOptionalText(value)
    if (!normalizedValue) {
        return
    }

    lines.push(`${title}:`)
    lines.push(normalizedValue)
}

function normalizeFilePointers(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) {
        return []
    }

    return Array.from(new Set(values
        .map((value) => normalizeOptionalText(value))
        .filter((value): value is string => value !== null)))
}

export function buildRevisionCarryoverBrief(input: RevisionCarryoverBriefInput): string {
    const { plan } = input
    const previousSummary = normalizeOptionalText(plan.candidate.session?.metadata?.summary?.text)
    const previousWorkspace = normalizePath(
        plan.candidate.member.workspaceRoot ?? plan.candidate.session?.metadata?.path ?? null
    )
    const filePointers = normalizeFilePointers(input.filePointers)
    const lines: string[] = [
        'Compact carryover brief for the next revision member.',
        `Previous member: ${buildMemberDescriptor(plan.candidate)}`,
        `Reason for revision: ${REVISION_REASON_LABELS[plan.reason]}`,
        `Previous session id: ${plan.candidate.member.sessionId}`
    ]

    if (previousWorkspace) {
        lines.push(`Previous workspace: ${previousWorkspace}`)
    }

    appendSection(lines, 'Task goal', input.taskGoal)
    appendSection(lines, 'Current artifact state', input.artifactSummary)
    appendSection(lines, 'Previous member summary', previousSummary)
    appendSection(lines, 'Attempts so far', input.attemptSummary)
    appendSection(lines, 'Known failure points', input.failureSummary)
    appendSection(lines, 'Review or verification notes', input.reviewSummary)

    if (filePointers.length > 0) {
        lines.push('Relevant file pointers:')
        for (const filePointer of filePointers) {
            lines.push(`- ${filePointer}`)
        }
    }

    return lines.join('\n')
}
