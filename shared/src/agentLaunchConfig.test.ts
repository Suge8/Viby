import { describe, expect, it } from 'vitest'
import { requiresAgentLaunchConfig } from './agentLaunchConfig'

describe('requiresAgentLaunchConfig', () => {
    it('requires launch config for Pi sessions', () => {
        expect(requiresAgentLaunchConfig({ agent: 'claude' })).toBe(false)
        expect(requiresAgentLaunchConfig({ agent: 'pi' })).toBe(true)
    })

    it('requires launch config for any submitted model or reasoning', () => {
        expect(requiresAgentLaunchConfig({ agent: 'claude', model: 'opus' })).toBe(true)
        expect(requiresAgentLaunchConfig({ agent: 'claude', modelReasoningEffort: 'high' })).toBe(true)
        expect(requiresAgentLaunchConfig({ agent: 'claude', model: 'auto', modelReasoningEffort: null })).toBe(true)
    })
})
