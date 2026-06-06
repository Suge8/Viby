import { describe, expect, it } from 'vitest'
import type { AgentLaunchConfig } from './agentLaunchConfig'
import {
    buildNewSessionAgentLaunchProjection,
    RuntimeAgentLaunchOptionsRequestSchema,
    resolveAgentLaunchOptions,
} from './agentLaunchOptions'

const ready = { driver: 'codex', status: 'ready', resolution: 'none', code: 'unknown', detectedAt: 1 } as const

const config: AgentLaunchConfig = {
    agent: 'codex',
    availableModels: [
        { id: 'gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['high', 'low', 'high'] },
        { id: 'gpt-5.5', label: '', supportedThinkingLevels: ['medium'] },
        { id: 'gpt-5.4', label: 'Duplicate', supportedThinkingLevels: ['low'] },
    ],
}

describe('agent launch options', () => {
    it('projects concrete AppCore model options without terminal defaults', () => {
        const projection = buildNewSessionAgentLaunchProjection([{ agent: 'codex', availability: ready, config }])

        expect(projection.agents[0]?.modelOptions).toEqual([
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.5', label: 'gpt-5.5' },
        ])
        expect(projection.agents[0]?.modelOptions.map((option) => option.value)).not.toContain('auto')
        expect(projection.agents[0]?.modelOptions.map((option) => option.value)).not.toContain('default')
        expect(projection.agents[0]?.reasoningOptionsByModel['gpt-5.4']).toEqual([
            { value: 'high', label: 'high' },
            { value: 'low', label: 'low' },
        ])
    })

    it('accepts HTTP and peer refresh spellings in one request schema', () => {
        expect(RuntimeAgentLaunchOptionsRequestSchema.parse({ directory: ' /repo ', refresh: '1' })).toEqual({
            directory: '/repo',
            refresh: true,
        })
        expect(RuntimeAgentLaunchOptionsRequestSchema.parse({ refresh: 'true' })).toEqual({ refresh: true })
        expect(RuntimeAgentLaunchOptionsRequestSchema.parse({ refresh: true })).toEqual({ refresh: true })
    })

    it('marks missing concrete options unavailable', () => {
        const projection = buildNewSessionAgentLaunchProjection([
            {
                agent: 'cursor',
                availability: { ...ready, driver: 'cursor' },
                config: { agent: 'cursor', availableModels: [] },
            },
        ])

        expect(projection.agents).toEqual([])
        expect(projection.unavailable.cursor).toBe('missing_model_options')
    })

    it('marks launch-config and availability failures unavailable', () => {
        const projection = buildNewSessionAgentLaunchProjection([
            { agent: 'codex', availability: ready, launchConfigError: true },
            {
                agent: 'claude',
                availability: {
                    driver: 'claude',
                    status: 'unavailable',
                    resolution: 'learn_more',
                    code: 'unknown',
                    detectedAt: 1,
                },
                config: { agent: 'claude', availableModels: [] },
            },
        ])

        expect(projection.unavailable.codex).toBe('launch_config_error')
        expect(projection.unavailable.claude).toBe('agent_unavailable')
    })

    it('selects first model and first reasoning when current selection is absent', () => {
        const agent = buildNewSessionAgentLaunchProjection([{ agent: 'codex', availability: ready, config }]).agents[0]

        expect(
            resolveAgentLaunchOptions(agent!, { model: 'missing', modelReasoningEffort: 'medium' }).selection
        ).toEqual({
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
        })
    })

    it('preserves valid current model and reasoning across refresh', () => {
        const agent = buildNewSessionAgentLaunchProjection([{ agent: 'codex', availability: ready, config }]).agents[0]

        expect(
            resolveAgentLaunchOptions(agent!, { model: 'gpt-5.5', modelReasoningEffort: 'medium' }).selection
        ).toEqual({
            model: 'gpt-5.5',
            modelReasoningEffort: 'medium',
        })
    })

    it('omits reasoning selection when selected model has no reasoning options', () => {
        const projection = buildNewSessionAgentLaunchProjection([
            {
                agent: 'gemini',
                availability: { ...ready, driver: 'gemini' },
                config: {
                    agent: 'gemini',
                    availableModels: [{ id: 'gemini', label: 'Gemini', supportedThinkingLevels: [] }],
                },
            },
        ])

        expect(resolveAgentLaunchOptions(projection.agents[0]!, { model: 'gemini' }).selection).toEqual({
            model: 'gemini',
            modelReasoningEffort: null,
        })
    })
})
