import { describe, expect, it } from 'vitest'
import { buildAskUserQuestionUpdatedInput } from './permissionHandlerSupport'

describe('buildAskUserQuestionUpdatedInput', () => {
    it('keys Claude AskUserQuestion answers by question text', () => {
        const updatedInput = buildAskUserQuestionUpdatedInput(
            {
                questions: [
                    { question: 'Pick deployment target', options: [{ label: 'Preview' }] },
                    { question: 'Select checks', multiSelect: true, options: [{ label: 'Typecheck' }] },
                ],
            },
            {
                '0': ['Preview'],
                '1': ['Typecheck', 'Build'],
            }
        )

        expect(updatedInput.answers).toEqual({
            'Pick deployment target': 'Preview',
            'Select checks': 'Typecheck,Build',
        })
    })

    it('drops empty selections before sending the Claude answer map', () => {
        const updatedInput = buildAskUserQuestionUpdatedInput(
            {
                questions: [{ question: 'Question one' }, { question: 'Question two' }],
            },
            {
                '0': { answers: ['  '] },
                '1': { answers: [' Yes '] },
            }
        )

        expect(updatedInput.answers).toEqual({
            'Question two': 'Yes',
        })
    })
})
