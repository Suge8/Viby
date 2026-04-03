import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
                case 'newSession.role':
                    return 'Role'
                case 'newSession.role.normal':
                    return 'Normal'
                case 'newSession.role.normal.desc':
                    return 'Normal session'
                case 'newSession.role.manager':
                    return 'Manager'
                case 'newSession.role.manager.desc':
                    return 'Manager session'
                case 'newSession.model':
                    return 'Model'
                case 'newSession.reasoningEffort':
                    return 'Reasoning effort'
                case 'newSession.yolo':
                    return 'Yolo'
                case 'newSession.piLaunchConfig.errorTitle':
                    return 'Pi config unavailable'
                case 'model.terminalDefault':
                    return 'Terminal default model'
                case 'reasoningEffort.terminalDefault':
                    return 'Terminal default reasoning effort'
                default:
                    return key
            }
        }
    })
}))

describe('NewSessionLaunchPanel', () => {
    it('shows pi in the agent picker', () => {
        render(
            <I18nProvider>
                <NewSessionLaunchPanel
                    form={{
                        agent: 'claude',
                        sessionRole: 'normal',
                        model: 'auto',
                        modelReasoningEffort: 'default',
                        yoloMode: false
                    }}
                    options={{
                        modelOptions: [{ value: 'auto', label: 'Terminal default model' }],
                        reasoningOptions: [{ value: 'default', label: 'Terminal default reasoning effort' }],
                        isDisabled: false
                    }}
                    handlers={{
                        onAgentChange: vi.fn(),
                        onSessionRoleChange: vi.fn(),
                        onModelChange: vi.fn(),
                        onReasoningEffortChange: vi.fn(),
                        onYoloModeChange: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByRole('radio', { name: /pi/i })).toBeInTheDocument()
    })

    it('does not render a Pi model select when the hot path stays terminal-default only', () => {
        render(
            <I18nProvider>
                <NewSessionLaunchPanel
                    form={{
                        agent: 'pi',
                        sessionRole: 'normal',
                        model: 'auto',
                        modelReasoningEffort: 'default',
                        yoloMode: false
                    }}
                    options={{
                        modelOptions: [],
                        reasoningOptions: [{ value: 'default', label: 'Terminal default reasoning effort' }],
                        isDisabled: false
                    }}
                    handlers={{
                        onAgentChange: vi.fn(),
                        onSessionRoleChange: vi.fn(),
                        onModelChange: vi.fn(),
                        onReasoningEffortChange: vi.fn(),
                        onYoloModeChange: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.queryByRole('combobox', { name: /model/i })).not.toBeInTheDocument()
    })

    it('shows a Pi launch config warning when config loading fails', () => {
        render(
            <I18nProvider>
                <NewSessionLaunchPanel
                    form={{
                        agent: 'pi',
                        sessionRole: 'normal',
                        model: 'auto',
                        modelReasoningEffort: 'default',
                        yoloMode: false
                    }}
                    options={{
                        modelOptions: [{ value: 'auto', label: 'Terminal default model' }],
                        reasoningOptions: [{ value: 'default', label: 'Terminal default reasoning effort' }],
                        isDisabled: false,
                        piLaunchConfigError: 'Pi auth missing'
                    }}
                    handlers={{
                        onAgentChange: vi.fn(),
                        onSessionRoleChange: vi.fn(),
                        onModelChange: vi.fn(),
                        onReasoningEffortChange: vi.fn(),
                        onYoloModeChange: vi.fn()
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByText('Pi config unavailable')).toBeInTheDocument()
        expect(screen.getByText('Pi auth missing')).toBeInTheDocument()
    })
})
