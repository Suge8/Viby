import { describe, expect, it } from 'bun:test'
import { findFirstReadyAgent, getAgentSupportLink, ListAgentAvailabilityRequestSchema } from './agentAvailability'

describe('agentAvailability', () => {
    it('returns the install link when available', () => {
        expect(getAgentSupportLink('claude', 'install')).toContain('anthropic.com')
    })

    it('falls back to learn-more links when a dedicated install link is unavailable', () => {
        expect(getAgentSupportLink('pi', 'install')).toContain('npmjs.com')
    })

    it('returns null when no action is needed', () => {
        expect(getAgentSupportLink('codex', 'none')).toBeNull()
        expect(getAgentSupportLink('codex', null)).toBeNull()
    })

    it('parses query booleans without treating "false" as true', () => {
        expect(ListAgentAvailabilityRequestSchema.parse({ forceRefresh: 'true' })).toEqual({
            forceRefresh: true,
        })
        expect(ListAgentAvailabilityRequestSchema.parse({ forceRefresh: 'false' })).toEqual({
            forceRefresh: false,
        })
    })

    it('finds the first ready agent from an availability snapshot', () => {
        expect(
            findFirstReadyAgent([
                {
                    driver: 'claude',
                    status: 'setup_required',
                    resolution: 'configure',
                    code: 'auth_missing',
                    detectedAt: 1,
                },
                { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            ])
        ).toBe('codex')
    })
})
