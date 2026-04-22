import type { AgentState, AgentStateRequest } from './schemas'
import { isObject } from './utils'

export type InteractiveRequestOption = {
    label: string
    description: string | null
}

export type AskUserQuestionQuestion = {
    header: string | null
    question: string
    options: InteractiveRequestOption[]
    multiSelect: boolean
}

export type RequestUserInputQuestion = {
    id: string
    header: string | null
    question: string
    options: InteractiveRequestOption[]
}

export type InteractiveQuestionMode = 'options-and-other' | 'options-and-note' | 'text-only'

export type InteractiveRequestQuestion = {
    id: string
    header: string | null
    question: string
    options: InteractiveRequestOption[]
    mode: InteractiveQuestionMode
    multiSelect: boolean
}

export type InteractiveQuestionRequest = {
    id: string
    createdAt: number | null
    toolName: string
    input: unknown
    kind: 'question'
    source: 'ask_user_question' | 'request_user_input'
    questions: InteractiveRequestQuestion[]
}

export type InteractivePermissionRequest = {
    id: string
    createdAt: number | null
    toolName: string
    input: unknown
    kind: 'permission'
    source: 'permission'
}

export type InteractiveRequest = InteractiveQuestionRequest | InteractivePermissionRequest

export function isAskUserQuestionToolName(toolName: string): boolean {
    return toolName === 'AskUserQuestion' || toolName === 'ask_user_question'
}

export function isRequestUserInputToolName(toolName: string): boolean {
    return toolName === 'request_user_input'
}

export function parseAskUserQuestionInput(input: unknown): { questions: AskUserQuestionQuestion[] } {
    if (!isObject(input)) {
        return { questions: [] }
    }

    const rawQuestions = input.questions
    if (!Array.isArray(rawQuestions)) {
        return { questions: [] }
    }

    const questions: AskUserQuestionQuestion[] = []
    for (const rawQuestion of rawQuestions) {
        if (!isObject(rawQuestion)) {
            continue
        }

        const question = typeof rawQuestion.question === 'string' ? rawQuestion.question.trim() : ''
        const header = typeof rawQuestion.header === 'string' ? rawQuestion.header.trim() : ''
        const multiSelect = rawQuestion.multiSelect === true
        const options = parseInteractiveRequestOptions(rawQuestion.options)
        if (!question && options.length === 0) {
            continue
        }

        questions.push({
            header: header.length > 0 ? header : null,
            question,
            options,
            multiSelect,
        })
    }

    return { questions }
}

export function parseRequestUserInputInput(input: unknown): { questions: RequestUserInputQuestion[] } {
    if (!isObject(input)) {
        return { questions: [] }
    }

    const rawQuestions = input.questions
    if (!Array.isArray(rawQuestions)) {
        return { questions: [] }
    }

    const questions: RequestUserInputQuestion[] = []
    for (const rawQuestion of rawQuestions) {
        if (!isObject(rawQuestion)) {
            continue
        }

        const id = typeof rawQuestion.id === 'string' ? rawQuestion.id.trim() : ''
        if (!id) {
            continue
        }

        const question = typeof rawQuestion.question === 'string' ? rawQuestion.question.trim() : ''
        const header = typeof rawQuestion.header === 'string' ? rawQuestion.header.trim() : ''
        questions.push({
            id,
            header: header.length > 0 ? header : null,
            question,
            options: parseInteractiveRequestOptions(rawQuestion.options),
        })
    }

    return { questions }
}

export function getPendingInteractiveRequests(agentState: AgentState | null | undefined): InteractiveRequest[] {
    const requests = agentState?.requests
    if (!requests) {
        return []
    }

    return Object.entries(requests)
        .map(([id, request]) => projectInteractiveRequest(id, request))
        .filter((request): request is InteractiveRequest => request !== null)
        .sort(compareInteractiveRequests)
}

export function getActiveInteractiveRequest(agentState: AgentState | null | undefined): InteractiveRequest | null {
    return getPendingInteractiveRequests(agentState)[0] ?? null
}

function projectInteractiveRequest(id: string, request: AgentStateRequest): InteractiveRequest | null {
    const toolName = request.tool
    if (typeof toolName !== 'string' || toolName.trim().length === 0) {
        return null
    }

    if (isAskUserQuestionToolName(toolName)) {
        return {
            id,
            createdAt: normalizeCreatedAt(request.createdAt),
            toolName,
            input: request.arguments,
            kind: 'question',
            source: 'ask_user_question',
            questions: parseAskUserQuestionInput(request.arguments).questions.map((question, index) => ({
                id: String(index),
                header: question.header,
                question: question.question,
                options: question.options,
                mode: question.options.length > 0 ? 'options-and-other' : 'text-only',
                multiSelect: question.multiSelect,
            })),
        }
    }

    if (isRequestUserInputToolName(toolName)) {
        return {
            id,
            createdAt: normalizeCreatedAt(request.createdAt),
            toolName,
            input: request.arguments,
            kind: 'question',
            source: 'request_user_input',
            questions: parseRequestUserInputInput(request.arguments).questions.map((question) => ({
                id: question.id,
                header: question.header,
                question: question.question,
                options: question.options,
                mode: question.options.length > 0 ? 'options-and-note' : 'text-only',
                multiSelect: false,
            })),
        }
    }

    return {
        id,
        createdAt: normalizeCreatedAt(request.createdAt),
        toolName,
        input: request.arguments,
        kind: 'permission',
        source: 'permission',
    }
}

function parseInteractiveRequestOptions(rawOptions: unknown): InteractiveRequestOption[] {
    if (!Array.isArray(rawOptions)) {
        return []
    }

    const options: InteractiveRequestOption[] = []
    for (const rawOption of rawOptions) {
        if (!isObject(rawOption)) {
            continue
        }

        const label = typeof rawOption.label === 'string' ? rawOption.label.trim() : ''
        if (!label) {
            continue
        }

        const description = typeof rawOption.description === 'string' ? rawOption.description.trim() : null
        options.push({
            label,
            description,
        })
    }

    return options
}

function normalizeCreatedAt(createdAt: number | null | undefined): number | null {
    return typeof createdAt === 'number' ? createdAt : null
}

function compareInteractiveRequests(left: InteractiveRequest, right: InteractiveRequest): number {
    const leftCreatedAt = left.createdAt ?? Number.MAX_SAFE_INTEGER
    const rightCreatedAt = right.createdAt ?? Number.MAX_SAFE_INTEGER
    if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt
    }

    return left.id.localeCompare(right.id)
}
