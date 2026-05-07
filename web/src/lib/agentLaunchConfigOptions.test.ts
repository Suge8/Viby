import { describe, expect, it } from 'vitest'
import type { AgentModelCapability } from '@/types/api'
import { findAgentModelCapability } from './sessionConfigAgentSupport'
import { getAgentLaunchModelOptions, getAgentLaunchReasoningEffortOptions } from './sessionConfigOptions'

describe('agent launch config options', () => {
    const capabilities: AgentModelCapability[] = [
        {
            id: 'openai/gpt-5.4',
            label: 'GPT-5.4',
            supportedThinkingLevels: ['none', 'low', 'high'],
        },
        {
            id: 'anthropic/claude-sonnet-4',
            label: 'Claude Sonnet 4',
            supportedThinkingLevels: ['none'],
        },
    ]

    it('builds launch model options from Pi capabilities', () => {
        expect(getAgentLaunchModelOptions(capabilities)).toEqual([
            {
                value: 'auto',
                label: 'Terminal default model',
                labelKey: 'model.terminalDefault',
            },
            {
                value: 'openai/gpt-5.4',
                label: 'GPT-5.4',
            },
            {
                value: 'anthropic/claude-sonnet-4',
                label: 'Claude Sonnet 4',
            },
        ])
    })

    it('limits launch reasoning options to the active Pi model capability', () => {
        expect(findAgentModelCapability('openai/gpt-5.4', capabilities)?.id).toBe('openai/gpt-5.4')
        expect(getAgentLaunchReasoningEffortOptions(['none', 'high'])).toEqual([
            {
                value: 'default',
                label: 'Terminal default reasoning effort',
                labelKey: 'reasoningEffort.terminalDefault',
            },
            {
                value: 'none',
                label: 'None',
                labelKey: 'reasoningEffort.none',
            },
            {
                value: 'high',
                label: 'High',
                labelKey: 'reasoningEffort.high',
            },
        ])
    })
})
