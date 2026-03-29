import { getSessionActivityKind, unwrapRoleWrappedRecordEnvelope } from '@viby/protocol'
import type {
    Session,
    TeamEventRecord,
    TeamMemberRecord,
    TeamTaskRecord
} from '@viby/protocol/types'
import type { Store } from '../store'
import type { StoredMessage } from '../store/types'

const CONTROL_EVENT_KINDS = new Set<TeamEventRecord['kind']>([
    'user-interjected',
    'user-takeover-started',
    'user-takeover-ended'
])

const TAKEOVER_START_EVENT_KINDS = new Set<TeamEventRecord['kind']>([
    'user-interjected',
    'user-takeover-started'
])

const HANDOFF_ACTION_LIMIT = 3
const HANDOFF_EXCERPT_MAX_LENGTH = 160

export type TeamManagerInstructionBlock =
    | { kind: 'user_control' }
    | { kind: 'pending_interject'; interjectedAt: number }

export type TeamHandbackSummary = {
    userActions: string[]
    currentStatus: string
    nextStep: string
}

function getLatestMemberControlEvent(
    store: Store,
    member: TeamMemberRecord
): TeamEventRecord | null {
    return store.teams
        .listProjectEvents(member.projectId, 200)
        .find((event) =>
            CONTROL_EVENT_KINDS.has(event.kind)
            && event.targetType === 'member'
            && event.targetId === member.id
        ) ?? null
}

function getLatestTakeoverBoundaryEvent(
    store: Store,
    member: TeamMemberRecord
): TeamEventRecord | null {
    return store.teams
        .listProjectEvents(member.projectId, 200)
        .find((event) =>
            TAKEOVER_START_EVENT_KINDS.has(event.kind)
            && event.targetType === 'member'
            && event.targetId === member.id
        ) ?? null
}

function excerptText(text: string): string {
    const normalized = text.trim().replace(/\s+/g, ' ')
    if (normalized.length <= HANDOFF_EXCERPT_MAX_LENGTH) {
        return normalized
    }

    return `${normalized.slice(0, HANDOFF_EXCERPT_MAX_LENGTH - 1).trimEnd()}…`
}

function extractTextMessage(message: StoredMessage): string | null {
    const record = unwrapRoleWrappedRecordEnvelope(message.content)
    if (!record) {
        return null
    }
    if (typeof record.content !== 'object' || record.content === null) {
        return null
    }

    const payload = record.content as {
        type?: unknown
        text?: unknown
    }
    if (payload.type !== 'text' || typeof payload.text !== 'string') {
        return null
    }

    const text = payload.text.trim()
    return text.length > 0 ? text : null
}

function extractRecentMessagesSince(
    store: Store,
    sessionId: string,
    startAt: number | null
): StoredMessage[] {
    const messages = store.messages.getMessages(sessionId, 200)
    if (startAt === null) {
        return messages
    }

    return messages.filter((message) => message.createdAt >= startAt)
}

export function resolveManagerInstructionBlock(
    store: Store,
    member: TeamMemberRecord
): TeamManagerInstructionBlock | null {
    if (member.controlOwner !== 'manager') {
        return { kind: 'user_control' }
    }

    const latestControlEvent = getLatestMemberControlEvent(store, member)
    if (!latestControlEvent || latestControlEvent.kind !== 'user-interjected') {
        return null
    }

    const readyAfterInterject = extractRecentMessagesSince(store, member.sessionId, latestControlEvent.createdAt)
        .some((message) =>
            // Message/event timestamps are only millisecond-granular, so the
            // ready that closes the current interject can share the same tick.
            message.createdAt >= latestControlEvent.createdAt
            && getSessionActivityKind(message.content) === 'ready'
        )
    if (readyAfterInterject) {
        return null
    }

    return {
        kind: 'pending_interject',
        interjectedAt: latestControlEvent.createdAt
    }
}

export function buildHandbackSummary(
    store: Store,
    member: TeamMemberRecord,
    options: {
        session: Session | null | undefined
        currentTask: TeamTaskRecord | null
    }
): TeamHandbackSummary {
    const boundaryEvent = getLatestTakeoverBoundaryEvent(store, member)
    const recentMessages = extractRecentMessagesSince(store, member.sessionId, boundaryEvent?.createdAt ?? null)
    const uniqueUserActions = Array.from(new Set(
        recentMessages
            .filter((message) => unwrapRoleWrappedRecordEnvelope(message.content)?.role === 'user')
            .map(extractTextMessage)
            .filter((value): value is string => value !== null)
            .map((text) => excerptText(text))
    ))
    const latestAssistantReply = recentMessages
        .slice()
        .reverse()
        .find((message) => unwrapRoleWrappedRecordEnvelope(message.content)?.role === 'agent' && extractTextMessage(message))
    const latestActivityKind = recentMessages.length > 0
        ? getSessionActivityKind(recentMessages[recentMessages.length - 1]?.content)
        : null
    const taskTitle = options.currentTask?.title?.trim() || null

    const userActions = uniqueUserActions.slice(0, HANDOFF_ACTION_LIMIT)
    const fallbackUserAction = boundaryEvent?.kind === 'user-interjected'
        ? '用户插入了一条额外指令并等待成员完成这一轮回复。'
        : '用户接管了该成员并在本地处理了一段时间。'
    const currentStatus = (() => {
        if (options.session?.thinking) {
            return '成员仍在处理接管期间的最新输入，当前还没有到 ready。'
        }
        const replyText = latestAssistantReply ? extractTextMessage(latestAssistantReply) : null
        if (replyText) {
            return `成员最近回复：${excerptText(replyText)}`
        }
        if (latestActivityKind === 'ready') {
            return '成员已完成接管期间最近一轮回复。'
        }
        if (userActions.length > 0) {
            return '用户已经补充了接管说明，但成员还没有产出新的 ready 回复。'
        }
        return taskTitle
            ? `当前仍围绕任务「${taskTitle}」推进。`
            : '接管期间没有新的成员回复。'
    })()
    const nextStep = options.session?.thinking
        ? '先等待成员完成当前这一轮回复，再决定是否继续 follow-up。'
        : taskTitle
            ? `先阅读接管期间的最新 transcript，再围绕任务「${taskTitle}」继续安排下一步。`
            : '先阅读接管期间的最新 transcript，再决定是否继续下发新指令。'

    return {
        userActions: userActions.length > 0 ? userActions : [fallbackUserAction],
        currentStatus,
        nextStep
    }
}

export function buildHandbackNoticeText(
    member: TeamMemberRecord,
    summary: TeamHandbackSummary,
    currentTask: TeamTaskRecord | null
): string {
    const lines = [
        `用户已将 ${member.role} r${member.revision} 归还给经理。`
    ]
    if (currentTask?.title) {
        lines.push(`当前任务：${currentTask.title}`)
    }
    lines.push(`用户处理：${summary.userActions.join('；')}`)
    lines.push(`当前状态：${summary.currentStatus}`)
    lines.push(`建议下一步：${summary.nextStep}`)
    return lines.join('\n')
}
