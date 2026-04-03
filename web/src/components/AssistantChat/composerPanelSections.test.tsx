import { Fragment } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SameSessionSwitchTargetDriver } from '@/lib/sameSessionDriverSwitch'
import { buildComposerControlSections } from './composerPanelSections'

function renderSections(options?: {
    switchTargetDriver?: SameSessionSwitchTargetDriver | null
    switchDriverPending?: boolean
}) {
    const sections = buildComposerControlSections({
        collaborationMode: 'default',
        collaborationModeOptions: [],
        controlsDisabled: false,
        model: 'gpt-5.4-mini',
        modelOptions: [],
        modelReasoningEffort: null,
        onCollaborationChange: vi.fn(),
        onModelChange: vi.fn(),
        onModelReasoningEffortChange: vi.fn(),
        onPermissionChange: vi.fn(),
        switchTargetDriver: options?.switchTargetDriver,
        switchDriverPending: options?.switchDriverPending ?? false,
        onSwitchSessionDriver: options?.switchTargetDriver ? vi.fn() : undefined,
        permissionMode: 'default',
        permissionModeOptions: [],
        reasoningEffortOptions: [],
        showCollaborationSettings: false,
        showModelSettings: false,
        showPermissionSettings: false,
        showReasoningEffortSettings: false,
        t: (key, params) => ({
            'composer.actions': 'Quick actions',
            'composer.controls': 'Controls',
            'composer.switchDriver': `Switch to ${params?.driver ?? 'unknown'}`,
            'composer.switchDriver.pending': `Switching to ${params?.driver ?? 'unknown'}`,
            'chat.switchDriver': `Continue this chat with ${params?.driver ?? 'unknown'}`,
            'composer.switchDriver.target.claude': 'Claude',
            'composer.switchDriver.target.codex': 'Codex',
        }[key] ?? key),
    })

    return render(<Fragment>{sections}</Fragment>)
}

describe('buildComposerControlSections', () => {
    it('does not render quick actions when no action handlers are available', () => {
        renderSections({ switchTargetDriver: null })

        expect(screen.queryByText('Quick actions')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument()
    })

    it('renders a Claude target label for Codex sessions', () => {
        renderSections({ switchTargetDriver: 'claude' })

        expect(screen.getByText('Quick actions')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to Claude/ })).toBeInTheDocument()
        expect(screen.getByText('Continue this chat with Claude')).toBeInTheDocument()
    })

    it('renders a Codex target label for Claude sessions', () => {
        renderSections({ switchTargetDriver: 'codex' })

        expect(screen.getByRole('button', { name: /Switch to Codex/ })).toBeInTheDocument()
        expect(screen.getByText('Continue this chat with Codex')).toBeInTheDocument()
    })

    it('shows pending switch copy without reintroducing local or remote wording', () => {
        renderSections({
            switchTargetDriver: 'claude',
            switchDriverPending: true
        })

        const button = screen.getByRole('button', { name: /Switching to Claude/ })
        expect(button).toBeDisabled()
        expect(screen.queryByText(/remote/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/local/i)).not.toBeInTheDocument()
    })
})
