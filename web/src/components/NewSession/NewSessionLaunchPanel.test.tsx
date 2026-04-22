import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { NewSessionLaunchPanel } from './NewSessionLaunchPanel'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            switch (key) {
                case 'newSession.launchSettings':
                    return 'Launch settings'
                case 'newSession.agent':
                    return 'Agent'
                case 'newSession.agentAvailability.helper':
                    return 'Agent availability helper'
                case 'newSession.agentAvailability.errorTitle':
                    return 'Could not check availability'
                case 'newSession.agentAvailability.selectedUnavailableTitle':
                    return 'Unavailable selected agent'
                case 'newSession.agentAvailability.selectedUnavailableDescription':
                    return 'Saved {agent} is {status}.'
                case 'newSession.agentAvailability.fallbackDescription':
                    return 'Saved {agent} is {status}. Using the first ready agent below.'
                case 'newSession.agentAvailability.refresh':
                    return 'Check again'
                case 'newSession.agentAvailability.refreshing':
                    return 'Checking…'
                case 'newSession.agentAvailability.status.ready':
                    return 'Ready'
                case 'newSession.agentAvailability.status.not_installed':
                    return 'Not installed'
                case 'newSession.agentAvailability.status.setup_required':
                    return 'Needs setup'
                case 'newSession.agentAvailability.status.unsupported_platform':
                    return 'Unsupported here'
                case 'newSession.agentAvailability.status.unavailable':
                    return 'Unavailable'
                case 'newSession.agentAvailability.status.unknown':
                    return 'Checking…'
                case 'newSession.agentAvailability.action.install':
                    return 'Install'
                case 'newSession.agentAvailability.action.configure':
                    return 'Set up'
                case 'newSession.agentAvailability.action.learn_more':
                    return 'Learn more'
                case 'newSession.model':
                    return 'Model'
                case 'newSession.reasoningEffort':
                    return 'Reasoning effort'
                case 'newSession.yolo':
                    return 'Yolo'
                case 'newSession.piLaunchConfig.errorTitle':
                    return 'Pi config unavailable'
                default:
                    return key
            }
        },
    }),
}))

afterEach(() => {
    cleanup()
})

type LaunchPanelProps = Parameters<typeof NewSessionLaunchPanel>[0]

function renderPanel(overrides?: {
    form?: Partial<LaunchPanelProps['form']>
    options?: Partial<LaunchPanelProps['options']>
    handlers?: Partial<LaunchPanelProps['handlers']>
}) {
    const onAgentChange = vi.fn()
    render(
        <I18nProvider>
            <NewSessionLaunchPanel
                form={{
                    agent: 'claude',
                    model: 'auto',
                    modelReasoningEffort: 'default',
                    yoloMode: false,
                    ...overrides?.form,
                }}
                options={{
                    modelOptions: [{ value: 'auto', label: 'Terminal default model' }],
                    reasoningOptions: [{ value: 'default', label: 'Terminal default reasoning effort' }],
                    isDisabled: false,
                    agentAvailability: [
                        { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'copilot', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'cursor', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'gemini', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'opencode', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                        { driver: 'pi', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    ],
                    agentAvailabilityLoading: false,
                    savedAgent: 'claude',
                    savedAgentAvailability: {
                        driver: 'claude',
                        status: 'ready',
                        resolution: 'none',
                        code: 'ready',
                        detectedAt: 1,
                    },
                    hasAgentFallback: false,
                    ...overrides?.options,
                }}
                handlers={{
                    onAgentChange,
                    onModelChange: vi.fn(),
                    onReasoningEffortChange: vi.fn(),
                    onYoloModeChange: vi.fn(),
                    onRefreshAgentAvailability: vi.fn(),
                    ...overrides?.handlers,
                }}
            />
        </I18nProvider>
    )

    return { onAgentChange }
}

describe('NewSessionLaunchPanel', () => {
    it('shows pi and copilot in the agent picker', () => {
        renderPanel()

        expect(screen.getAllByRole('radio')).toHaveLength(7)
        expect(screen.getByText('Pi')).toBeInTheDocument()
        expect(screen.getByText('Copilot')).toBeInTheDocument()
    })

    it('renders unavailable agents as disabled cards with install CTA', () => {
        renderPanel({
            form: { agent: 'gemini' },
            options: {
                agentAvailability: [
                    { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'copilot', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'cursor', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    {
                        driver: 'gemini',
                        status: 'not_installed',
                        resolution: 'install',
                        code: 'command_missing',
                        detectedAt: 1,
                    },
                    { driver: 'opencode', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'pi', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                ],
                savedAgent: 'gemini',
                savedAgentAvailability: {
                    driver: 'gemini',
                    status: 'not_installed',
                    resolution: 'install',
                    code: 'command_missing',
                    detectedAt: 1,
                },
                hasAgentFallback: true,
            },
        })

        expect(screen.getByText('Unavailable selected agent')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Install' })).toBeInTheDocument()
        expect(screen.getAllByText('Not installed').length).toBeGreaterThan(0)
    })

    it('does not change the agent when clicking an unavailable card CTA', () => {
        const { onAgentChange } = renderPanel({
            options: {
                agentAvailability: [
                    { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'copilot', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'cursor', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'gemini', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    { driver: 'opencode', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
                    {
                        driver: 'pi',
                        status: 'setup_required',
                        resolution: 'configure',
                        code: 'auth_missing',
                        detectedAt: 1,
                    },
                ],
            },
        })

        fireEvent.click(screen.getByRole('link', { name: 'Set up' }))

        expect(onAgentChange).not.toHaveBeenCalled()
    })

    it('shows a Pi launch config warning when config loading fails', () => {
        renderPanel({
            form: { agent: 'pi' },
            options: {
                piLaunchConfigError: 'Pi auth missing',
            },
        })

        expect(screen.getByText('Pi config unavailable')).toBeInTheDocument()
        expect(screen.getByText('Pi auth missing')).toBeInTheDocument()
    })
})
