import { describe, expect, it } from 'bun:test'
import { requiresAgentLaunchConfig } from './agentLaunchConfig'

describe('requiresAgentLaunchConfig', () => {
    it('keeps default startup config-free except Pi', () => {
        expect(requiresAgentLaunchConfig({ agent: 'claude' })).toBe(false)
        expect(requiresAgentLaunchConfig({ agent: 'pi' })).toBe(true)
    })

    it('requires config for explicit model or reasoning overrides', () => {
        expect(requiresAgentLaunchConfig({ agent: 'claude', model: 'opus' })).toBe(true)
        expect(requiresAgentLaunchConfig({ agent: 'claude', modelReasoningEffort: 'high' })).toBe(true)
        expect(requiresAgentLaunchConfig({ agent: 'claude', model: 'auto', modelReasoningEffort: null })).toBe(false)
    })
})
