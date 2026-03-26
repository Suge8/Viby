import type { SessionTeamContext, TeamRolePrototype } from '@viby/protocol/types'
import { trimIdent } from '@/utils/trimIdent'

type MemberRolePrototype = Exclude<TeamRolePrototype, 'manager'>

const MEMBER_ROLE_FOCUS: Record<MemberRolePrototype, string> = {
    planner: '负责把目标拆成可执行计划，并及时指出需求歧义与依赖风险。',
    architect: '负责设计方案、边界与接口，不替代实现者完成大段编码。',
    implementer: '负责按任务实现代码与变更，保持范围收敛并对结果负责。',
    debugger: '负责定位根因、复现实验与修复验证，不靠补丁掩盖问题。',
    reviewer: '负责审阅实现、指出回归风险与缺失测试，给出 accept/request_changes。',
    verifier: '负责执行测试、smoke 与 acceptance criteria 对照，给出 pass/fail。',
    designer: '负责界面与交互设计产出，明确说明约束、取舍与交付边界。'
}

export function buildManagerPromptContract(): string {
    return trimIdent(`
        You are the Viby manager session.
        Your primary job is orchestration, not default implementation.
        You must break work down, recruit or replace members, assign tasks, track progress,
        request review and verification, and perform final acceptance before delivery.
        Replan when work is blocked, rejected, or fails verification.
        Minimize unnecessary interruptions to the human and escalate only when the task
        is genuinely ambiguous, destructive, or blocked on missing resources.
    `)
}

export function buildMemberPromptContract(role: MemberRolePrototype): string {
    return trimIdent(`
        You are a Viby team member, not the manager.
        Your role prototype is "${role}".
        ${MEMBER_ROLE_FOCUS[role]}
        Stay inside your role boundary, report blocked states explicitly, and return concise
        delivery updates that the manager can use for the next orchestration step.
    `)
}

export function resolveTeamRolePromptContract(
    teamContext?: Pick<SessionTeamContext, 'sessionRole' | 'memberRole'>
): string | undefined {
    if (!teamContext) {
        return undefined
    }

    if (teamContext.sessionRole === 'manager') {
        return buildManagerPromptContract()
    }

    const memberRole = teamContext.memberRole
    if (!memberRole || memberRole === 'manager') {
        throw new Error('Team member session is missing a valid memberRole prompt contract')
    }

    return buildMemberPromptContract(memberRole)
}

export function mergePromptSegments(...segments: Array<string | null | undefined>): string | undefined {
    const normalized = segments
        .map((segment) => (typeof segment === 'string' ? segment.trim() : undefined))
        .filter((segment): segment is string => Boolean(segment))

    return normalized.length > 0 ? normalized.join('\n\n') : undefined
}
