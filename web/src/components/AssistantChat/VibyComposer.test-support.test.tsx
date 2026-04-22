import { cleanup, render } from '@testing-library/react'
import type { ComponentProps, FormHTMLAttributes, JSX, TextareaHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { PlainButton } from '@/components/ui/plain-button'
import { Textarea } from '@/components/ui/textarea'
import { I18nProvider } from '@/lib/i18n-context'
import { VibyComposer } from './VibyComposer'

type ComposerInputProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    cancelOnEscape?: boolean
    maxRows?: number
    submitOnEnter?: boolean
}

type ComposerTestHarness = {
    rootProps: FormHTMLAttributes<HTMLFormElement> | null
    inputProps: ComposerInputProps | null
    lastButtonsProps: Record<string, unknown> | null
    cancelRun: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    setText: ReturnType<typeof vi.fn>
    handleChange: ReturnType<typeof vi.fn>
    lastSuggestionsOverlayProps: Record<string, unknown> | null
    lastControlsOverlayProps: Record<string, unknown> | null
    isTouch: boolean
}

const harness = vi.hoisted<ComposerTestHarness>(() => ({
    rootProps: null as FormHTMLAttributes<HTMLFormElement> | null,
    inputProps: null as ComposerInputProps | null,
    lastButtonsProps: null as Record<string, unknown> | null,
    cancelRun: vi.fn(),
    send: vi.fn(),
    setText: vi.fn(),
    handleChange: vi.fn(),
    lastSuggestionsOverlayProps: null as Record<string, unknown> | null,
    lastControlsOverlayProps: null as Record<string, unknown> | null,
    isTouch: false,
}))

export function getComposerHarness(): ComposerTestHarness {
    return harness
}

vi.mock('@assistant-ui/react', () => ({
    ComposerPrimitive: {
        Root: ({ children, ...props }: FormHTMLAttributes<HTMLFormElement>) => {
            harness.rootProps = props
            return <form {...props}>{children}</form>
        },
        Input: (props: ComposerInputProps) => {
            harness.inputProps = props
            const {
                submitOnEnter: _submitOnEnter,
                cancelOnEscape: _cancelOnEscape,
                maxRows: _maxRows,
                ...textareaProps
            } = props
            return <Textarea {...textareaProps} />
        },
        Attachments: () => null,
    },
    useAssistantApi: () => ({
        thread: () => ({ cancelRun: harness.cancelRun }),
        composer: () => ({ send: harness.send, setText: harness.setText }),
    }),
    useAssistantState: (
        selector: (state: {
            composer: { text: string; attachments: unknown[] }
            thread: { isRunning: boolean; isDisabled: boolean }
        }) => unknown
    ) =>
        selector({
            composer: { text: '', attachments: [] },
            thread: { isRunning: false, isDisabled: false },
        }),
}))

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({ select }: { select: (location: { pathname: string }) => string }) => {
        return select({ pathname: '/sessions/session-1' })
    },
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
        },
        isTouch: harness.isTouch,
    }),
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: (props: Record<string, unknown>) => {
        harness.lastButtonsProps = props
        const controlsButton = props.controlsButton as {
            disabled?: boolean
            onToggle: () => void
            visible: boolean
        }

        return (
            <div data-testid="composer-buttons">
                {controlsButton.visible ? (
                    <PlainButton disabled={controlsButton.disabled === true} onClick={controlsButton.onToggle}>
                        toggle-controls
                    </PlainButton>
                ) : null}
            </div>
        )
    },
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null,
}))

vi.mock('@/components/AssistantChat/ComposerSuggestionsOverlay', () => ({
    ComposerSuggestionsOverlay: (props: Record<string, unknown>) => {
        harness.lastSuggestionsOverlayProps = props
        return null
    },
}))

vi.mock('@/components/AssistantChat/ComposerControlsOverlay', () => ({
    default: (props: Record<string, unknown>) => {
        harness.lastControlsOverlayProps = props
        return <div data-testid="composer-controls-overlay" />
    },
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
        handleChange: harness.handleChange,
        handleSelect: vi.fn(),
        handlePaste: vi.fn(),
    }),
}))

beforeEach(() => {
    harness.rootProps = null
    harness.inputProps = null
    harness.lastButtonsProps = null
    harness.cancelRun.mockReset()
    harness.send.mockReset()
    harness.setText.mockReset()
    harness.handleChange.mockReset()
    harness.lastSuggestionsOverlayProps = null
    harness.lastControlsOverlayProps = null
    harness.isTouch = false
    vi.useRealTimers()
})

afterEach(() => {
    cleanup()
})

export function createComposerModel(options?: {
    configOverrides?: Partial<ComponentProps<typeof VibyComposer>['model']['config']>
    replyingPhase?: ComponentProps<typeof VibyComposer>['model']['replyingPhase']
}): ComponentProps<typeof VibyComposer>['model'] {
    return {
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
            sessionDriver: 'codex',
            attachmentsSupported: true,
            ...options?.configOverrides,
        },
        handlers: {
            onPermissionModeChange: vi.fn(),
        },
    }
}

export function createComposerNode(model: ComponentProps<typeof VibyComposer>['model']): JSX.Element {
    return (
        <I18nProvider>
            <VibyComposer model={model} />
        </I18nProvider>
    )
}

export function renderComposer(options?: {
    configOverrides?: Partial<ComponentProps<typeof VibyComposer>['model']['config']>
    replyingPhase?: ComponentProps<typeof VibyComposer>['model']['replyingPhase']
}): ReturnType<typeof render> {
    const renderResult = render(createComposerNode(createComposerModel(options)))

    expect(renderResult.container.querySelector('.ds-composer-surface')).not.toBeNull()
    return renderResult
}

export function renderComposerWithModel(
    model: ComponentProps<typeof VibyComposer>['model']
): ReturnType<typeof render> {
    return render(createComposerNode(model))
}

describe.skip('VibyComposer test support', () => {})
