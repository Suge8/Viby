import { describe, expect, it } from 'vitest'
import { parseInternalAgentAvailabilityArgs } from './internalAgentAvailability'

describe('internalAgentAvailability', () => {
    it('parses force refresh, directory, and driver flags', () => {
        expect(
            parseInternalAgentAvailabilityArgs([
                '--force-refresh',
                '--directory',
                '/tmp/viby',
                '--drivers',
                'codex,claude,codex',
            ])
        ).toEqual({
            directory: '/tmp/viby',
            forceRefresh: true,
            drivers: ['claude', 'codex'],
        })
    })

    it('rejects empty directory values through the shared schema', () => {
        expect(() => parseInternalAgentAvailabilityArgs(['--directory', '   '])).toThrow()
    })

    it('rejects unknown flags', () => {
        expect(() => parseInternalAgentAvailabilityArgs(['--legacy-mode'])).toThrow(
            'Unknown __internal_agent_availability argument: --legacy-mode'
        )
    })
})
