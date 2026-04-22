import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PlanProposalView } from '@/components/ToolCard/views/PlanProposalView'

describe('PlanProposalView', () => {
    it('renders markdown plan content for proposed_plan surfaces', () => {
        const { container } = render(
            <PlanProposalView
                block={{
                    kind: 'tool-call',
                    id: 'plan-1',
                    localId: null,
                    createdAt: 1,
                    children: [],
                    tool: {
                        id: 'plan-1',
                        name: 'proposed_plan',
                        state: 'completed',
                        input: { plan: '## Summary\n\n- Ship native render' },
                        createdAt: 1,
                        startedAt: 1,
                        completedAt: 1,
                        description: null,
                        result: { plan: '## Summary\n\n- Ship native render' },
                    },
                }}
                metadata={null}
            />
        )

        expect(container.textContent).toContain('## Summary')
        expect(container.textContent).toContain('Ship native render')
    })
})
