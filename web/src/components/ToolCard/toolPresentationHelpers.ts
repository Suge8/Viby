import { isObject } from '@viby/protocol'
import { truncate } from '@/lib/toolInputUtils'

export const DEFAULT_ICON_CLASS = 'h-3.5 w-3.5'

type ToolQuestion = {
    header?: string
    id?: string
    question?: string
}

export function countLines(text: string): number {
    return text.split('\n').length
}

export function formatChecklistCount(items: { length: number }, noun: string): string | null {
    if (items.length === 0) {
        return null
    }

    return `${items.length} ${noun}${items.length === 1 ? '' : 's'}`
}

function snakeToTitleWithSpaces(value: string): string {
    return value
        .split('_')
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
}

export function formatMCPTitle(toolName: string): string {
    const withoutPrefix = toolName.replace(/^mcp__/, '')
    const parts = withoutPrefix.split('__')
    if (parts.length >= 2) {
        const serverName = snakeToTitleWithSpaces(parts[0])
        const toolPart = snakeToTitleWithSpaces(parts.slice(1).join('_'))
        return `MCP: ${serverName} ${toolPart}`
    }

    return `MCP: ${snakeToTitleWithSpaces(withoutPrefix)}`
}

export function getQuestions(input: unknown): ToolQuestion[] {
    if (!isObject(input) || !Array.isArray(input.questions)) {
        return []
    }

    return input.questions.filter((question): question is ToolQuestion => isObject(question))
}

export function getQuestionTitle(input: unknown, fallbackTitle: string, primaryField: 'header' | 'id'): string {
    const questions = getQuestions(input)
    const count = questions.length
    const first = questions[0]
    const rawTitle = typeof first?.[primaryField] === 'string' ? first[primaryField]?.trim() : ''

    if (count > 1) {
        return `${count} Questions`
    }

    return rawTitle && rawTitle.length > 0 ? rawTitle : fallbackTitle
}

export function getQuestionSubtitle(input: unknown): string | null {
    const questions = getQuestions(input)
    const count = questions.length
    const first = questions[0]
    const question = typeof first?.question === 'string' ? first.question.trim() : ''

    if (!question) {
        return null
    }

    if (count > 1) {
        return `${truncate(question, 100)} (+${count - 1} more)`
    }

    return truncate(question, 120)
}
