import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { NewSessionLaunchPanel } from './NewSessionLaunchPanel'

type PanelProps = Parameters<typeof NewSessionLaunchPanel>[0]

function createProps(overrides: Partial<PanelProps> = {}): PanelProps {
    const props: PanelProps = {
        form: {
            agent: 'codex',
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            codexServiceTier: 'standard',
            yoloMode: false,
        },
        options: {
            modelOptions: [{ value: 'gpt-5.4', label: 'GPT-5.4' }],
            reasoningOptions: [{ value: 'high', label: 'high' }],
            isDisabled: false,
            agentLaunchProjection: {
                agents: [
                    {
                        agent: 'codex',
                        modelOptions: [{ value: 'gpt-5.4', label: 'GPT-5.4' }],
                        reasoningOptionsByModel: { 'gpt-5.4': [{ value: 'high', label: 'high' }] },
                    },
                ],
                unavailable: { cursor: 'missing_model_options' },
            },
            agentAvailabilityLoading: false,
            agentAvailabilityRefreshing: false,
            savedAgent: 'codex',
            savedAgentUnavailableReason: null,
            hasAgentFallback: false,
            agentLaunchConfigLoading: false,
        },
        handlers: {
            onAgentChange: vi.fn(),
            onModelChange: vi.fn(),
            onReasoningEffortChange: vi.fn(),
            onCodexServiceTierChange: vi.fn(),
            onYoloModeChange: vi.fn(),
            onRefreshAgentAvailability: vi.fn(),
        },
    }
    return {
        ...props,
        ...overrides,
        options: { ...props.options, ...overrides.options },
        handlers: { ...props.handlers, ...overrides.handlers },
    }
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
    const props = createProps(overrides)
    return {
        ...render(
            <I18nProvider>
                <NewSessionLaunchPanel {...props} />
            </I18nProvider>
        ),
        props,
    }
}

describe('NewSessionLaunchPanel', () => {
    it('renders selectable agents and disabled unavailable agents', () => {
        renderPanel()

        expect(screen.getByRole('radio', { name: /codex/i })).toBeInTheDocument()
        expect(screen.getByText('newSession.agentLaunch.unavailable.missing_model_options')).toBeInTheDocument()
    })

    it('shows launch-config error copy for unavailable agents', () => {
        renderPanel({
            options: {
                ...createProps().options,
                agentLaunchProjection: { agents: [], unavailable: { codex: 'launch_config_error' } },
            },
        })

        expect(screen.getByText('newSession.agentLaunch.unavailable.launch_config_error')).toBeInTheDocument()
    })

    it('sends concrete model selections', async () => {
        const { props } = renderPanel({
            options: {
                ...createProps().options,
                modelOptions: [
                    { value: 'gpt-5.4', label: 'GPT-5.4' },
                    { value: 'gpt-5.5', label: 'GPT-5.5' },
                ],
            },
        })

        fireEvent.click(screen.getByRole('button', { name: 'newSession.model' }))
        fireEvent.click(screen.getByText('GPT-5.5'))

        expect(props.handlers.onModelChange).toHaveBeenCalledWith('gpt-5.5')
    })
})
