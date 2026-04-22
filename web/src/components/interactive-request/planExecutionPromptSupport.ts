import { extractProposedPlanSegments } from '@viby/protocol'
import { normalizeDecryptedMessage } from '@/chat/normalize'
import type { DecryptedMessage, Session } from '@/types/api'

export const IMPLEMENT_PLAN_MESSAGE = 'Implement the plan.'

export type PlanExecutionPrompt = {
    id: string
    title: string
    summary: string | null
}

export function getActivePlanExecutionPrompt(args: {
    session: Session
    messages: DecryptedMessage[]
    hasPendingInteractiveRequest: boolean
    isReplying: boolean
}): PlanExecutionPrompt | null {
    if (
        args.session.collaborationMode !== 'plan' ||
        !args.session.active ||
        args.hasPendingInteractiveRequest ||
        args.isReplying
    ) {
        return null
    }

    const lastUserCreatedAt = getLastUserCreatedAt(args.messages)
    for (let index = args.messages.length - 1; index >= 0; index -= 1) {
        const message = args.messages[index]
        if (!message) {
            continue
        }
        if (message.createdAt < lastUserCreatedAt) {
            break
        }

        const prompt = getPlanExecutionPromptFromMessage(message)
        if (prompt) {
            return prompt
        }
    }

    return null
}

function getLastUserCreatedAt(messages: DecryptedMessage[]): number {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (!message) {
            continue
        }

        const normalized = normalizeDecryptedMessage(message)
        if (normalized?.role === 'user') {
            return message.createdAt
        }
    }

    return Number.NEGATIVE_INFINITY
}

function getPlanExecutionPromptFromMessage(message: DecryptedMessage): PlanExecutionPrompt | null {
    const normalized = normalizeDecryptedMessage(message)
    if (!normalized || normalized.role !== 'agent' || !Array.isArray(normalized.content)) {
        return null
    }

    for (let index = normalized.content.length - 1; index >= 0; index -= 1) {
        const block = normalized.content[index]
        if (block?.type === 'tool-call' && block.name === 'proposed_plan') {
            const planMarkdown =
                block.input &&
                typeof block.input === 'object' &&
                'plan' in block.input &&
                typeof block.input.plan === 'string'
                    ? block.input.plan.trim()
                    : null
            if (planMarkdown) {
                return {
                    id: `${message.id}:${block.id}`,
                    ...summarizePlanMarkdown(planMarkdown),
                }
            }
            continue
        }

        if (block?.type !== 'text') {
            continue
        }

        const planMarkdown = extractLastProposedPlanMarkdown(block.text)
        if (!planMarkdown) {
            continue
        }

        return {
            id: `${message.id}:${index}`,
            ...summarizePlanMarkdown(planMarkdown),
        }
    }

    return null
}

function extractLastProposedPlanMarkdown(text: string): string | null {
    const segments = extractProposedPlanSegments(text)
    for (let index = segments.length - 1; index >= 0; index -= 1) {
        const segment = segments[index]
        if (segment?.kind === 'proposed_plan' && segment.markdown.trim().length > 0) {
            return segment.markdown.trim()
        }
    }

    return null
}

function summarizePlanMarkdown(markdown: string): Pick<PlanExecutionPrompt, 'title' | 'summary'> {
    const lines = markdown
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    const title = lines.find((line) => /^#{1,6}\s+/.test(line))?.replace(/^#{1,6}\s+/, '') ?? 'Plan ready'
    const summary =
        lines.find((line) => !/^#{1,6}\s+/.test(line) && !/^[-*]\s+/.test(line)) ??
        lines.find((line) => /^[-*]\s+/.test(line))?.replace(/^[-*]\s+/, '') ??
        null

    return {
        title,
        summary,
    }
}
