import {
    type InteractiveRequestOption as AskUserQuestionOption,
    type AskUserQuestionQuestion,
    isAskUserQuestionToolName,
    isObject,
    parseAskUserQuestionInput,
} from '@viby/protocol'

export type { AskUserQuestionOption, AskUserQuestionQuestion }

export type AskUserQuestionQuestionInfo = {
    header: string | null
    question: string | null
}

export { isAskUserQuestionToolName, parseAskUserQuestionInput }

export function extractAskUserQuestionQuestionsInfo(input: unknown): AskUserQuestionQuestionInfo[] | null {
    if (!isObject(input) || !Array.isArray(input.questions)) return null

    return parseAskUserQuestionInput(input).questions.map((question) => ({
        header: question.header,
        question: question.question || null,
    }))
}
