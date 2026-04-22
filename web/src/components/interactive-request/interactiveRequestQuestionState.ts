import type { InteractiveQuestionRequest, InteractiveRequestQuestion } from '@viby/protocol/types'

export type InteractiveQuestionAnswerState = Record<
    string,
    {
        selectedOptions: string[]
        customText: string
    }
>

const EMPTY_INTERACTIVE_QUESTION_ANSWER = {
    selectedOptions: [],
    customText: '',
} satisfies InteractiveQuestionAnswerState[string]
const REQUEST_USER_INPUT_NOTE_PREFIX = 'user_note: '

export function createInitialInteractiveQuestionAnswerState(
    request: InteractiveQuestionRequest
): InteractiveQuestionAnswerState {
    return Object.fromEntries(
        request.questions.map((question) => [question.id, createEmptyInteractiveQuestionAnswer()])
    )
}

export function toggleInteractiveQuestionOption(
    state: InteractiveQuestionAnswerState,
    question: InteractiveRequestQuestion,
    optionLabel: string
): InteractiveQuestionAnswerState {
    const currentEntry = getInteractiveQuestionAnswer(state, question.id)
    const selectedOptions = getUpdatedSelectedOptions(question, currentEntry.selectedOptions, optionLabel)

    return {
        ...state,
        [question.id]: {
            ...currentEntry,
            selectedOptions,
        },
    }
}

export function setInteractiveQuestionCustomText(
    state: InteractiveQuestionAnswerState,
    questionId: string,
    customText: string
): InteractiveQuestionAnswerState {
    const currentEntry = getInteractiveQuestionAnswer(state, questionId)
    return {
        ...state,
        [questionId]: {
            ...currentEntry,
            customText,
        },
    }
}

export function hasInteractiveQuestionAnswer(
    question: InteractiveRequestQuestion,
    state: InteractiveQuestionAnswerState
): boolean {
    const entry = state[question.id]
    const selectedCount = entry?.selectedOptions.length ?? 0
    const hasCustomText = Boolean(entry?.customText.trim())

    if (question.mode === 'text-only') {
        return hasCustomText
    }

    return selectedCount > 0 || hasCustomText
}

export function buildInteractiveQuestionAnswers(
    request: InteractiveQuestionRequest,
    state: InteractiveQuestionAnswerState
): { answers: Record<string, string[]> } | { answers: Record<string, { answers: string[] }> } {
    if (request.source === 'ask_user_question') {
        return {
            answers: Object.fromEntries(
                request.questions.map((question) => {
                    return [question.id, getAskUserQuestionAnswers(getInteractiveQuestionAnswer(state, question.id))]
                })
            ),
        }
    }

    return {
        answers: Object.fromEntries(
            request.questions.map((question) => {
                return [
                    question.id,
                    {
                        answers: getRequestUserInputAnswers(getInteractiveQuestionAnswer(state, question.id)),
                    },
                ]
            })
        ),
    }
}

function createEmptyInteractiveQuestionAnswer(): InteractiveQuestionAnswerState[string] {
    return {
        ...EMPTY_INTERACTIVE_QUESTION_ANSWER,
        selectedOptions: [],
    }
}

function getInteractiveQuestionAnswer(
    state: InteractiveQuestionAnswerState,
    questionId: string
): InteractiveQuestionAnswerState[string] {
    return state[questionId] ?? createEmptyInteractiveQuestionAnswer()
}

function getUpdatedSelectedOptions(
    question: InteractiveRequestQuestion,
    selectedOptions: readonly string[],
    optionLabel: string
): string[] {
    if (question.multiSelect) {
        return toggleMultiSelect(selectedOptions, optionLabel)
    }

    if (selectedOptions[0] === optionLabel) {
        return []
    }

    return [optionLabel]
}

function getAskUserQuestionAnswers(answer: InteractiveQuestionAnswerState[string]): string[] {
    const customText = answer.customText.trim()
    return customText.length > 0 ? [...answer.selectedOptions, customText] : [...answer.selectedOptions]
}

function getRequestUserInputAnswers(answer: InteractiveQuestionAnswerState[string]): string[] {
    const answers = answer.selectedOptions[0] ? [answer.selectedOptions[0]] : []
    const customText = answer.customText.trim()
    if (customText.length > 0) {
        answers.push(`${REQUEST_USER_INPUT_NOTE_PREFIX}${customText}`)
    }

    return answers
}

function toggleMultiSelect(selectedOptions: readonly string[], optionLabel: string): string[] {
    return selectedOptions.includes(optionLabel)
        ? selectedOptions.filter((selectedOption) => selectedOption !== optionLabel)
        : [...selectedOptions, optionLabel]
}
