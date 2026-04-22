import { describe, expect, it } from 'bun:test'
import {
    getActiveInteractiveRequest,
    getPendingInteractiveRequests,
    parseAskUserQuestionInput,
    parseRequestUserInputInput,
} from './interactiveRequest'

describe('interactiveRequest', () => {
    it('parses ask-user-question payloads into stable question shapes', () => {
        expect(
            parseAskUserQuestionInput({
                questions: [
                    {
                        header: 'Pick one',
                        question: 'What should run?',
                        multiSelect: true,
                        options: [
                            { label: 'Tests', description: 'Run tests' },
                            { label: 'Lint', description: 'Run lint' },
                        ],
                    },
                ],
            })
        ).toEqual({
            questions: [
                {
                    header: 'Pick one',
                    question: 'What should run?',
                    multiSelect: true,
                    options: [
                        { label: 'Tests', description: 'Run tests' },
                        { label: 'Lint', description: 'Run lint' },
                    ],
                },
            ],
        })
    })

    it('parses request-user-input payloads into id-keyed questions', () => {
        expect(
            parseRequestUserInputInput({
                questions: [
                    {
                        id: 'risk',
                        header: 'Risk',
                        question: 'How risky is this?',
                        options: [{ label: 'Low', description: 'Proceed' }],
                    },
                ],
            })
        ).toEqual({
            questions: [
                {
                    id: 'risk',
                    header: 'Risk',
                    question: 'How risky is this?',
                    options: [{ label: 'Low', description: 'Proceed' }],
                },
            ],
        })
    })

    it('projects pending requests into a single ordered interactive request lane', () => {
        const agentState = {
            requests: {
                permission: {
                    tool: 'Bash',
                    arguments: { cmd: 'rm -rf tmp' },
                    createdAt: 30,
                },
                question: {
                    tool: 'request_user_input',
                    arguments: {
                        questions: [
                            {
                                id: 'confirm',
                                question: 'Proceed?',
                                options: [{ label: 'Yes', description: 'Go ahead' }],
                            },
                        ],
                    },
                    createdAt: 20,
                },
            },
        }

        const requests = getPendingInteractiveRequests(agentState)
        expect(requests.map((request) => request.id)).toEqual(['question', 'permission'])
        expect(getActiveInteractiveRequest(agentState)).toEqual(requests[0])
        expect(requests[0]).toMatchObject({
            kind: 'question',
            source: 'request_user_input',
            questions: [
                {
                    id: 'confirm',
                    mode: 'options-and-note',
                },
            ],
        })
        expect(requests[1]).toMatchObject({
            kind: 'permission',
            source: 'permission',
            toolName: 'Bash',
        })
    })
})
