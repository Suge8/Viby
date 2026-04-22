import { describe, expect, it } from 'bun:test'
import { extractProposedPlanSegments } from './proposedPlan'

describe('proposedPlan', () => {
    it('keeps plain text unchanged when no proposed plan block exists', () => {
        expect(extractProposedPlanSegments('Hello world')).toEqual([{ kind: 'text', text: 'Hello world' }])
    })

    it('extracts a standalone proposed plan block', () => {
        expect(
            extractProposedPlanSegments(['<proposed_plan>', '# Title', '', '- item 1', '</proposed_plan>'].join('\n'))
        ).toEqual([
            {
                kind: 'proposed_plan',
                markdown: ['# Title', '', '- item 1'].join('\n'),
            },
        ])
    })

    it('preserves surrounding text around a proposed plan block', () => {
        expect(
            extractProposedPlanSegments(['Intro', '<proposed_plan>', '# Plan', '</proposed_plan>', 'Outro'].join('\n'))
        ).toEqual([
            { kind: 'text', text: 'Intro\n' },
            { kind: 'proposed_plan', markdown: '# Plan' },
            { kind: 'text', text: '\nOutro' },
        ])
    })

    it('ignores inline tags that are not on their own lines', () => {
        expect(extractProposedPlanSegments('prefix <proposed_plan>\n# Plan\n</proposed_plan> suffix')).toEqual([
            {
                kind: 'text',
                text: 'prefix <proposed_plan>\n# Plan\n</proposed_plan> suffix',
            },
        ])
    })
})
