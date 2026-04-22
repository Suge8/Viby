import {
    isObject,
    isRequestUserInputToolName,
    parseRequestUserInputInput,
    type InteractiveRequestOption as RequestUserInputOption,
    type RequestUserInputQuestion,
} from '@viby/protocol'

export type { RequestUserInputOption, RequestUserInputQuestion }

export type RequestUserInputQuestionInfo = {
    id: string
    question: string | null
}

// Nested answer format: { answers: { [id]: { answers: string[] } } }
export type RequestUserInputAnswers = Record<string, { answers: string[] }>
const REQUEST_USER_INPUT_NOTE_PREFIX = 'user_note: '

export { isRequestUserInputToolName, parseRequestUserInputInput }

export function extractRequestUserInputQuestionsInfo(input: unknown): RequestUserInputQuestionInfo[] | null {
    if (!isObject(input) || !Array.isArray(input.questions)) return null

    return parseRequestUserInputInput(input).questions.map((question) => ({
        id: question.id,
        question: question.question || null,
    }))
}

export function formatRequestUserInputAnswers(
    answersByQuestion: Record<string, { selected: string | null; userNote: string }>
): { answers: RequestUserInputAnswers } {
    const answers: RequestUserInputAnswers = {}

    for (const [id, answer] of Object.entries(answersByQuestion)) {
        const answerArray: string[] = []
        if (answer.selected) {
            answerArray.push(answer.selected)
        }

        const note = answer.userNote.trim()
        if (note.length > 0) {
            answerArray.push(`${REQUEST_USER_INPUT_NOTE_PREFIX}${note}`)
        }

        answers[id] = { answers: answerArray }
    }

    return { answers }
}

export function parseRequestUserInputAnswers(
    answers: unknown
): Record<string, { selected: string | null; userNote: string | null }> | null {
    if (!isObject(answers)) return null
    const answersObject = isObject(answers.answers) ? answers.answers : answers

    const parsed: Record<string, { selected: string | null; userNote: string | null }> = {}
    for (const [id, value] of Object.entries(answersObject)) {
        let answerArray: string[] = []
        if (isObject(value) && Array.isArray(value.answers)) {
            answerArray = value.answers.filter((item): item is string => typeof item === 'string')
        } else if (Array.isArray(value)) {
            answerArray = value.filter((item): item is string => typeof item === 'string')
        }

        let selected: string | null = null
        let userNote: string | null = null
        for (const item of answerArray) {
            if (item.startsWith(REQUEST_USER_INPUT_NOTE_PREFIX)) {
                userNote = item.slice(REQUEST_USER_INPUT_NOTE_PREFIX.length).trim()
            } else if (!selected) {
                selected = item.trim()
            }
        }

        parsed[id] = { selected, userNote }
    }

    return parsed
}
