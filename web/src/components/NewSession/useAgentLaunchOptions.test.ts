import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAgentLaunchOptions, withCurrentLaunchOption } from './useAgentLaunchOptions'

describe('useAgentLaunchOptions', () => {
    it('annotates terminal defaults with resolved local runtime config', () => {
        const { result } = renderHook(() =>
            useAgentLaunchOptions({
                agent: 'pi',
                model: 'auto',
                modelReasoningEffort: 'default',
                directory: '/repo',
                launchConfig: {
                    agent: 'pi',
                    defaultModel: 'openai/gpt-5.4',
                    defaultModelReasoningEffort: 'high',
                    availableModels: [
                        { id: 'openai/gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['none', 'high'] },
                    ],
                },
                updateAgentSetting: vi.fn(),
                setModel: vi.fn(),
                setModelReasoningEffort: vi.fn(),
            })
        )

        expect(result.current.modelOptions[0]).toMatchObject({ value: 'auto', resolvedLabel: 'GPT-5.4' })
        expect(result.current.reasoningOptions[0]).toMatchObject({
            value: 'default',
            resolvedLabel: 'High',
            resolvedLabelKey: 'reasoningEffort.high',
        })
    })

    it('leaves the default option unannotated while the launch config is still loading', () => {
        const { result } = renderHook(() =>
            useAgentLaunchOptions({
                agent: 'pi',
                model: 'auto',
                modelReasoningEffort: 'default',
                directory: '/repo',
                launchConfig: null,
                updateAgentSetting: vi.fn(),
                setModel: vi.fn(),
                setModelReasoningEffort: vi.fn(),
            })
        )

        const modelDefault = result.current.modelOptions[0]
        const reasoningDefault = result.current.reasoningOptions[0]
        expect(modelDefault?.value).toBe('auto')
        expect(modelDefault?.resolvedLabel).toBeUndefined()
        expect(modelDefault?.resolvedLabelKey).toBeUndefined()
        expect(reasoningDefault?.value).toBe('default')
        expect(reasoningDefault?.resolvedLabel).toBeUndefined()
        expect(reasoningDefault?.resolvedLabelKey).toBeUndefined()
    })

    it('annotates non-Pi terminal defaults from the same launch config owner', () => {
        const { result } = renderHook(() =>
            useAgentLaunchOptions({
                agent: 'codex',
                model: 'auto',
                modelReasoningEffort: 'default',
                directory: '/repo',
                launchConfig: {
                    agent: 'codex',
                    defaultModel: 'gpt-5.4',
                    defaultModelReasoningEffort: 'medium',
                    availableModels: [{ id: 'gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['low', 'medium'] }],
                },
                updateAgentSetting: vi.fn(),
                setModel: vi.fn(),
                setModelReasoningEffort: vi.fn(),
            })
        )

        expect(result.current.modelOptions[0]).toMatchObject({ value: 'auto', resolvedLabel: 'GPT-5.4' })
        expect(result.current.reasoningOptions[0]).toMatchObject({
            value: 'default',
            resolvedLabel: 'Medium',
            resolvedLabelKey: 'reasoningEffort.medium',
        })
    })
})

describe('withCurrentLaunchOption', () => {
    it('keeps the current saved model visible when the curated list no longer includes it', () => {
        const options = withCurrentLaunchOption(
            [
                { value: 'auto', label: 'Terminal default model' },
                { value: 'gpt-5.4', label: 'GPT-5.4' },
            ],
            'gpt-5.99-preview',
            'auto'
        )

        expect(options).toEqual([
            { value: 'auto', label: 'Terminal default model' },
            { value: 'gpt-5.99-preview', label: 'gpt-5.99-preview' },
            { value: 'gpt-5.4', label: 'GPT-5.4' },
        ])
    })

    it('does not inject a duplicate option when the current value is already known', () => {
        const options = withCurrentLaunchOption(
            [
                { value: 'default', label: 'Terminal default reasoning effort' },
                { value: 'high', label: 'High' },
            ],
            'high',
            'default'
        )

        expect(options).toEqual([
            { value: 'default', label: 'Terminal default reasoning effort' },
            { value: 'high', label: 'High' },
        ])
    })

    it('does not inject the default sentinel value', () => {
        const options = withCurrentLaunchOption([{ value: 'auto', label: 'Terminal default model' }], 'auto', 'auto')

        expect(options).toEqual([{ value: 'auto', label: 'Terminal default model' }])
    })
})
