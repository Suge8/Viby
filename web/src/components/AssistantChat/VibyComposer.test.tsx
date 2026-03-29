import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, FormHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REPLYING_INDICATOR_EXIT_DURATION_MS } from '@/components/AssistantChat/useReplyingIndicatorPresence'
import { I18nProvider } from '@/lib/i18n-context'
import { VibyComposer } from './VibyComposer'

const harness = vi.hoisted(() => ({
    rootProps: null as FormHTMLAttributes<HTMLFormElement> | null,
    inputProps: null as (TextareaHTMLAttributes<HTMLTextAreaElement> & {
        submitOnEnter?: boolean
        cancelOnEscape?: boolean
        maxRows?: number
    }) | null,
    lastButtonsProps: null as Record<string, unknown> | null,
    cancelRun: vi.fn(),
    send: vi.fn(),
    setText: vi.fn()
}))

vi.mock('@assistant-ui/react', () => ({
    ComposerPrimitive: {
        Root: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => {
            harness.rootProps = props
            return <form {...props}>{children}</form>
        },
        Input: (props: TextareaHTMLAttributes<HTMLTextAreaElement> & {
            submitOnEnter?: boolean
            cancelOnEscape?: boolean
            maxRows?: number
        }) => {
            harness.inputProps = props
            const {
                submitOnEnter: _submitOnEnter,
                cancelOnEscape: _cancelOnEscape,
                maxRows: _maxRows,
                ...textareaProps
            } = props
            return <textarea {...textareaProps} />
        },
        Attachments: () => null
    },
    useAssistantApi: () => ({
        thread: () => ({ cancelRun: harness.cancelRun }),
        composer: () => ({ send: harness.send, setText: harness.setText })
    }),
    useAssistantState: (selector: (state: {
        composer: { text: string; attachments: unknown[] }
        thread: { isRunning: boolean; isDisabled: boolean }
    }) => unknown) => selector({
        composer: { text: '', attachments: [] },
        thread: { isRunning: false, isDisabled: false }
    })
}))

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({ select }: { select: (location: { pathname: string }) => string }) => {
        return select({ pathname: '/sessions/session-1' })
    }
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn()
        },
        isTouch: false
    })
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: (props: Record<string, unknown>) => {
        harness.lastButtonsProps = props
        const controlsButton = props.controlsButton as {
            visible: boolean
            onToggle: () => void
        }

        return (
            <div data-testid="composer-buttons">
                {controlsButton.visible ? (
                    <button type="button" onClick={controlsButton.onToggle}>
                        toggle-controls
                    </button>
                ) : null}
            </div>
        )
    }
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null
}))

vi.mock('@/components/AssistantChat/ComposerSuggestionsOverlay', () => ({
    ComposerSuggestionsOverlay: () => null
}))

vi.mock('@/components/AssistantChat/ComposerControlsOverlay', () => ({
    default: () => <div data-testid="composer-controls-overlay" />
}))

vi.mock('@/components/AssistantChat/useComposerInputController', () => ({
    useComposerInputController: () => ({
        textareaRef: { current: null },
        suggestions: [],
        selectedIndex: -1,
        handleSuggestionSelect: vi.fn(),
        handleKeyDown: vi.fn(),
        handleCompositionStart: vi.fn(),
        handleCompositionEnd: vi.fn(),
        handleChange: vi.fn(),
        handleSelect: vi.fn(),
        handlePaste: vi.fn()
    })
}))

beforeEach(() => {
    harness.rootProps = null
    harness.inputProps = null
    harness.lastButtonsProps = null
    harness.cancelRun.mockReset()
    harness.send.mockReset()
    harness.setText.mockReset()
    vi.useRealTimers()
})

afterEach(() => {
    cleanup()
})

function renderComposer(options?: {
    configOverrides?: Partial<ComponentProps<typeof VibyComposer>['model']['config']>
    onWarmSession?: () => void
    replyingPhase?: ComponentProps<typeof VibyComposer>['model']['replyingPhase']
}): void {
    const { container } = render(
        <I18nProvider>
            <VibyComposer
                model={{
                    sessionId: 'session-1',
                    replyingPhase: options?.replyingPhase ?? null,
                    config: {
                        permissionMode: 'default',
                        collaborationMode: 'default',
                        model: null,
                        modelReasoningEffort: null,
                        active: true,
                        allowSendWhenInactive: false,
                        controlledByUser: false,
                        agentFlavor: 'codex',
                        attachmentsSupported: true,
                        ...options?.configOverrides
                    },
                    handlers: {
                        onPermissionModeChange: vi.fn()
                    },
                    onWarmSession: options?.onWarmSession
                }}
            />
        </I18nProvider>
    )

    expect(container.firstElementChild).toHaveClass('ds-composer-shell')
    expect(container.querySelector('.ds-composer-surface')).not.toBeNull()
}

function renderComposerWithConfig(configOverrides: Partial<ComponentProps<typeof VibyComposer>['model']['config']>): void {
    renderComposer({ configOverrides })
}

describe('VibyComposer', () => {
    it('disables library submitOnEnter so keyboard submission stays under the local controller', () => {
        renderComposer()

        expect(harness.inputProps?.submitOnEnter).toBe(false)
    })

    it('prevents hidden form submit so mobile and IME flows cannot bypass the local send controller', () => {
        renderComposer()

        const preventDefault = vi.fn()

        harness.rootProps?.onSubmit?.({
            preventDefault,
        } as unknown as React.FormEvent<HTMLFormElement>)

        expect(preventDefault).toHaveBeenCalledOnce()
        expect(harness.send).not.toHaveBeenCalled()
    })

    it('shows the resume placeholder for closed sessions that can be continued', () => {
        renderComposerWithConfig({
            active: false,
            allowSendWhenInactive: true
        })

        expect(harness.inputProps?.placeholder).toMatch(/^(misc\.resumeMessage|Send a message to resume\.\.\.)$/)
    })

    it('shows a lightweight resuming placeholder and disables input while the session is being reattached', () => {
        renderComposerWithConfig({
            active: false,
            allowSendWhenInactive: true,
            isResuming: true
        })

        expect(harness.inputProps?.placeholder).toMatch(/^(misc\.resumingSession|Resuming session\.\.\.)$/)
        expect(harness.inputProps?.disabled).toBe(true)
        expect(harness.rootProps?.['aria-busy']).toBe('true')
    })

    it('loads the controls overlay only after the controls button is explicitly opened', async () => {
        renderComposer()

        expect(screen.queryByTestId('composer-controls-overlay')).not.toBeInTheDocument()

        fireEvent.click(screen.getByText('toggle-controls'))

        expect(await screen.findByTestId('composer-controls-overlay')).toBeInTheDocument()
        expect(
            (harness.lastButtonsProps?.controlsButton as { active?: boolean } | null)?.active
        ).toBe(true)
    })

    it('does not warm an inactive session just because the composer receives focus', () => {
        const onWarmSession = vi.fn()
        renderComposer({
            configOverrides: {
                active: false,
                allowSendWhenInactive: true
            },
            onWarmSession
        })

        fireEvent.focus(screen.getByRole('textbox'))

        expect(onWarmSession).not.toHaveBeenCalled()
    })

    it('warms an inactive session on the first non-empty typing intent only once', () => {
        const onWarmSession = vi.fn()
        renderComposer({
            configOverrides: {
                active: false,
                allowSendWhenInactive: true
            },
            onWarmSession
        })

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello again' } })

        expect(onWarmSession).toHaveBeenCalledTimes(1)
    })

    it('renders a minimal replying indicator above the composer surface when the session is replying', () => {
        const { container } = render(
            <I18nProvider>
                <VibyComposer
                    model={{
                        sessionId: 'session-1',
                        replyingPhase: 'replying',
                        config: {
                            permissionMode: 'default',
                            collaborationMode: 'default',
                            model: null,
                            modelReasoningEffort: null,
                            active: true,
                            allowSendWhenInactive: false,
                            controlledByUser: false,
                            agentFlavor: 'codex',
                            attachmentsSupported: true,
                        },
                        handlers: {
                            onPermissionModeChange: vi.fn()
                        }
                    }}
                />
            </I18nProvider>
        )

        const indicator = screen.getByTestId('assistant-replying-indicator')
        const surface = container.querySelector('.ds-composer-surface')

        expect(screen.getByRole('status', { name: 'AI is replying' })).toBeInTheDocument()
        expect(indicator).toHaveClass('ds-replying-indicator')
        expect(indicator.textContent).toBe('')
        expect(indicator.compareDocumentPosition(surface as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('keeps the replying indicator mounted briefly for a smooth fade-out after replying finishes', () => {
        vi.useFakeTimers()

        const { rerender } = render(
            <I18nProvider>
                <VibyComposer
                    model={{
                        sessionId: 'session-1',
                        replyingPhase: 'replying',
                        config: {
                            permissionMode: 'default',
                            collaborationMode: 'default',
                            model: null,
                            modelReasoningEffort: null,
                            active: true,
                            allowSendWhenInactive: false,
                            controlledByUser: false,
                            agentFlavor: 'codex',
                            attachmentsSupported: true,
                        },
                        handlers: {
                            onPermissionModeChange: vi.fn()
                        }
                    }}
                />
            </I18nProvider>
        )

        rerender(
            <I18nProvider>
                <VibyComposer
                    model={{
                        sessionId: 'session-1',
                        replyingPhase: null,
                        config: {
                            permissionMode: 'default',
                            collaborationMode: 'default',
                            model: null,
                            modelReasoningEffort: null,
                            active: true,
                            allowSendWhenInactive: false,
                            controlledByUser: false,
                            agentFlavor: 'codex',
                            attachmentsSupported: true,
                        },
                        handlers: {
                            onPermissionModeChange: vi.fn()
                        }
                    }}
                />
            </I18nProvider>
        )

        expect(screen.getByTestId('assistant-replying-indicator').parentElement).toHaveAttribute('data-state', 'exiting')

        act(() => {
            vi.advanceTimersByTime(REPLYING_INDICATOR_EXIT_DURATION_MS)
        })

        expect(screen.queryByTestId('assistant-replying-indicator')).not.toBeInTheDocument()
    })
})
