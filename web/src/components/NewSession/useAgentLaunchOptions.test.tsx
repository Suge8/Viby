import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAgentLaunchOptions } from './useAgentLaunchOptions'

describe('useAgentLaunchOptions', () => {
    it('applies normalized temporary selection from Hub projection', () => {
        const setModel = vi.fn()
        const setModelReasoningEffort = vi.fn()

        const { result } = renderHook(() =>
            useAgentLaunchOptions({
                projection: {
                    agents: [
                        {
                            agent: 'codex',
                            modelOptions: [{ value: 'gpt-5.4', label: 'GPT-5.4' }],
                            reasoningOptionsByModel: { 'gpt-5.4': [{ value: 'high', label: 'high' }] },
                        },
                    ],
                    unavailable: {},
                },
                agent: 'codex',
                model: '',
                modelReasoningEffort: null,
                setModel,
                setModelReasoningEffort,
            })
        )

        expect(result.current.modelOptions).toEqual([{ value: 'gpt-5.4', label: 'GPT-5.4' }])
        expect(result.current.reasoningOptions).toEqual([{ value: 'high', label: 'high' }])
        expect(result.current.selection).toEqual({ model: 'gpt-5.4', modelReasoningEffort: 'high' })
        expect(setModel).toHaveBeenCalledWith('gpt-5.4')
        expect(setModelReasoningEffort).toHaveBeenCalledWith('high')
    })

    it('falls back to first selectable agent from the projection', () => {
        const { result } = renderHook(() =>
            useAgentLaunchOptions({
                projection: {
                    agents: [
                        {
                            agent: 'claude',
                            modelOptions: [{ value: 'opus', label: 'Opus' }],
                            reasoningOptionsByModel: { opus: [] },
                        },
                    ],
                    unavailable: { gemini: 'missing_model_options' },
                },
                agent: 'gemini',
                model: '',
                modelReasoningEffort: null,
                setModel: vi.fn(),
                setModelReasoningEffort: vi.fn(),
            })
        )

        expect(result.current.effectiveAgentSelection.effectiveAgent).toBe('claude')
        expect(result.current.savedAgentUnavailableReason).toBe('missing_model_options')
        expect(result.current.selection).toEqual({ model: 'opus', modelReasoningEffort: null })
    })
})
