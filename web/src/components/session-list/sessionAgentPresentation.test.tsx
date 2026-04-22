import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getSessionAgentLabel } from '@/lib/sessionAgentLabel'
import { SessionAgentBrandIcon } from './sessionAgentPresentation'

describe('sessionAgentPresentation', () => {
    it('uses the bundled Copilot asset through the shared brand icon owner', () => {
        const { container } = render(<SessionAgentBrandIcon driver="copilot" className="h-4 w-4" />)

        const icon = container.querySelector('span')
        expect(icon?.getAttribute('style')).toContain('/agent-copilot.svg')
    })

    it('returns the Copilot label', () => {
        expect(getSessionAgentLabel('copilot')).toBe('Copilot')
    })
})
