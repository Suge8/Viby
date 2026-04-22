import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SameSessionSwitchTargetDriver, SessionDriver } from '@viby/protocol'
import { Fragment } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import {
    COMPOSER_MODEL_SECTION_TEST_ID,
    COMPOSER_SWITCH_AGENT_SECTION_TEST_ID,
    getComposerSwitchTargetTestId,
} from '@/lib/sessionUiContracts'
import { buildComposerControlSections } from './composerPanelSections'

afterEach(() => {
    cleanup()
})

function renderSections(options?: {
    sessionDriver?: SessionDriver | null
    switchTargetDrivers?: readonly SameSessionSwitchTargetDriver[] | null
    switchDriverPending?: boolean
    showModelSettings?: boolean
    showReasoningEffortSettings?: boolean
    showCollaborationSettings?: boolean
    showPermissionSettings?: boolean
}) {
    const sections = buildComposerControlSections({
        collaborationMode: 'default',
        collaborationModeOptions: [{ value: 'default', label: 'Start now' }],
        controlsDisabled: false,
        model: 'gpt-5.4-mini',
        modelOptions: [{ value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' }],
        modelReasoningEffort: null,
        sessionDriver: options?.sessionDriver ?? 'codex',
        onCollaborationChange: vi.fn(),
        onModelChange: vi.fn(),
        onModelReasoningEffortChange: vi.fn(),
        onPermissionChange: vi.fn(),
        switchTargetDrivers: options?.switchTargetDrivers,
        switchDriverPending: options?.switchDriverPending ?? false,
        onSwitchSessionDriver: options?.switchTargetDrivers?.length ? vi.fn() : undefined,
        permissionMode: 'default',
        permissionModeOptions: [{ value: 'default', label: 'Standard' }],
        reasoningEffortOptions: [{ value: null, label: 'Default' }],
        showCollaborationSettings: options?.showCollaborationSettings ?? false,
        showModelSettings: options?.showModelSettings ?? false,
        showPermissionSettings: options?.showPermissionSettings ?? false,
        showReasoningEffortSettings: options?.showReasoningEffortSettings ?? false,
        t: (key, params) =>
            ({
                'misc.model': 'Model',
                'misc.reasoningEffort': 'Reasoning',
                'misc.collaborationMode': 'Execution mode',
                'misc.permissionMode': 'Permission',
                'composer.switchAgent': 'Switch agent',
                'composer.currentAgent': `Current ${params?.driver ?? 'unknown'}`,
                'composer.switchDriver': `Switch to ${params?.driver ?? 'unknown'}`,
                'composer.switchDriver.pending': `Switching to ${params?.driver ?? 'unknown'}`,
                'composer.switchDriver.target.claude': 'Claude',
                'composer.switchDriver.target.codex': 'Codex',
                'composer.switchDriver.target.gemini': 'Gemini',
                'composer.switchDriver.target.opencode': 'OpenCode',
                'composer.switchDriver.target.cursor': 'Cursor',
                'composer.switchDriver.target.pi': 'Pi',
            })[key] ?? key,
    })

    return render(
        <I18nProvider>
            <Fragment>{sections}</Fragment>
        </I18nProvider>
    )
}

describe('buildComposerControlSections', () => {
    it('does not render the switch-agent group when no switch targets are available', () => {
        renderSections({ switchTargetDrivers: null })

        expect(screen.queryByText('Switch agent')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument()
    })

    it('shows the current driver summary and reveals switch targets on demand', () => {
        renderSections({ sessionDriver: 'codex', switchTargetDrivers: ['claude'] })

        expect(screen.getByText('Switch agent')).toBeInTheDocument()
        expect(screen.getByText('Current Codex')).toBeInTheDocument()
        expect(screen.getByTestId(COMPOSER_SWITCH_AGENT_SECTION_TEST_ID)).toHaveAttribute(
            'data-current-driver',
            'codex'
        )
        expect(screen.queryByRole('button', { name: /Switch to Claude/ })).not.toBeInTheDocument()

        fireEvent.click(screen.getByText('Switch agent'))

        expect(screen.getByRole('button', { name: /Switch to Claude/ })).toBeInTheDocument()
        expect(screen.getByTestId(getComposerSwitchTargetTestId('claude'))).toBeInTheDocument()
    })

    it('shows pending switch copy after the switch-agent group is expanded', () => {
        renderSections({
            sessionDriver: 'codex',
            switchTargetDrivers: ['claude'],
            switchDriverPending: true,
        })

        fireEvent.click(screen.getByText('Switch agent'))

        const button = screen.getByRole('button', { name: /Switching to Claude/ })
        expect(button).toBeDisabled()
        expect(screen.queryByText(/remote/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/local/i)).not.toBeInTheDocument()
    })

    it('renders all available switch targets inside the same expandable group', () => {
        renderSections({ switchTargetDrivers: ['claude', 'gemini', 'pi', 'cursor', 'opencode'] })

        fireEvent.click(screen.getByText('Switch agent'))

        expect(screen.getByRole('button', { name: /Switch to Claude/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to Gemini/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to Pi/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to Cursor/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to OpenCode/ })).toBeInTheDocument()
    })

    it('keeps execution mode as the second-last section', () => {
        renderSections({
            switchTargetDrivers: ['claude'],
            showModelSettings: true,
            showReasoningEffortSettings: true,
            showCollaborationSettings: true,
            showPermissionSettings: true,
        })

        const labels = ['Switch agent', 'Model', 'Reasoning', 'Execution mode', 'Permission'].map((text) =>
            screen.getByText(text)
        )

        for (let index = 0; index < labels.length - 1; index += 1) {
            expect(
                labels[index]?.compareDocumentPosition(labels[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING
            ).toBeTruthy()
        }

        expect(screen.getByTestId(COMPOSER_MODEL_SECTION_TEST_ID)).toBeInTheDocument()
    })
})
