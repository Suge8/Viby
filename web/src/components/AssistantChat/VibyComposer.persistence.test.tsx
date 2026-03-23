import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { ComposerDraftController } from '@/components/AssistantChat/ComposerDraftController'
import { I18nProvider } from '@/lib/i18n-context'
import { useVibyRuntime } from '@/lib/assistant-runtime'
import { VibyComposer } from './VibyComposer'

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({
        select
    }: {
        select: (location: { pathname: string, href: string, state?: { __TSR_key?: string } }) => string
    }) => {
        return select({
            pathname: '/sessions/session-1',
            href: '/sessions/session-1',
            state: {
                __TSR_key: 'activation-a'
            }
        })
    }
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn()
        }
    })
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: () => <div data-testid="composer-buttons" />
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null
}))

vi.mock('@/components/AssistantChat/ComposerSuggestionsOverlay', () => ({
    ComposerSuggestionsOverlay: () => null
}))

const DRAFT_STORAGE_KEY = 'viby-composer-draft::session-1'

function ComposerPersistenceHarness(): React.JSX.Element {
    const runtime = useVibyRuntime({
        session: {
            id: 'session-1',
            active: true,
            thinking: false,
            permissionMode: 'default',
            collaborationMode: 'default',
            model: null,
            modelReasoningEffort: null,
            metadata: { flavor: 'codex' },
            agentState: { controlledByUser: false }
        } as never,
        blocks: [],
        isSending: false,
        onSendMessage: vi.fn(),
        onAbort: vi.fn(async () => undefined)
    })

    return (
        <I18nProvider>
            <AssistantRuntimeProvider runtime={runtime}>
                <ComposerDraftController sessionId="session-1" />
                <VibyComposer
                    model={{
                        sessionId: 'session-1',
                        config: {
                            permissionMode: 'default',
                            collaborationMode: 'default',
                            model: null,
                            modelReasoningEffort: null,
                            active: true,
                            allowSendWhenInactive: false,
                            controlledByUser: false,
                            agentFlavor: 'codex',
                            attachmentsSupported: true
                        },
                        handlers: {
                            onPermissionModeChange: vi.fn()
                        }
                    }}
                />
            </AssistantRuntimeProvider>
        </I18nProvider>
    )
}

describe('VibyComposer draft persistence', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    afterEach(() => {
        cleanup()
    })

    it('persists input text and restores it after remount', async () => {
        const firstRender = render(<ComposerPersistenceHarness />)
        const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement

        fireEvent.change(textarea, {
            target: {
                value: 'draft survives remount',
                selectionStart: 21,
                selectionEnd: 21
            }
        })

        await waitFor(() => {
            expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toContain('draft survives remount')
        })

        firstRender.unmount()

        render(<ComposerPersistenceHarness />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('draft survives remount')
        })
    })
})
