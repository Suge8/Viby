import { Fragment } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildComposerControlSections } from './composerPanelSections'

function renderSections(showSwitchRemote: boolean) {
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
        onSwitchToRemote: showSwitchRemote ? vi.fn() : undefined,
        permissionMode: 'default',
        permissionModeOptions: [],
        reasoningEffortOptions: [],
        showCollaborationSettings: false,
        showModelSettings: false,
        showPermissionSettings: false,
        showReasoningEffortSettings: false,
        t: (key) => ({
            'composer.actions': 'Quick actions',
            'composer.controls': 'Controls',
            'composer.switchRemote': 'Switch to remote mode',
            'chat.switchRemote': 'Switch to remote',
        }[key] ?? key),
    })

    return render(<Fragment>{sections}</Fragment>)
}

describe('buildComposerControlSections', () => {
    it('does not render quick actions when no action handlers are available', () => {
        renderSections(false)

        expect(screen.queryByText('Quick actions')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Switch to remote mode/ })).not.toBeInTheDocument()
    })

    it('renders only the remaining switch-remote quick action when available', () => {
        renderSections(true)

        expect(screen.getByText('Quick actions')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to remote mode/ })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Terminal/ })).not.toBeInTheDocument()
    })
})
