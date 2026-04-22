import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposerDraftController } from '@/components/AssistantChat/ComposerDraftController'
import {
    readComposerDraftFromIndexedDb,
    resetComposerDraftPersistenceForTests,
} from '@/components/AssistantChat/composerDraftStore'
import { useVibyRuntime } from '@/lib/assistant-runtime'
import { I18nProvider } from '@/lib/i18n-context'
import { preloadI18nForTests } from '@/test/i18n'
import { VibyComposer } from './VibyComposer'

vi.mock('@tanstack/react-router', () => ({
    useLocation: ({
        select,
    }: {
        select: (location: { pathname: string; href: string; state?: { __TSR_key?: string } }) => string
    }) => {
        return select({
            pathname: '/sessions/session-1',
            href: '/sessions/session-1',
            state: {
                __TSR_key: 'activation-a',
            },
        })
    },
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: false,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn(),
        },
    }),
}))

vi.mock('@/components/AssistantChat/ComposerButtons', () => ({
    ComposerButtons: () => <div data-testid="composer-buttons" />,
}))

vi.mock('@/components/AssistantChat/AttachmentItem', () => ({
    AttachmentItem: () => null,
}))

vi.mock('@/components/AssistantChat/ComposerSuggestionsOverlay', () => ({
    ComposerSuggestionsOverlay: () => null,
}))

function ComposerPersistenceRuntime(props: { sessionId: string }): React.JSX.Element {
    const runtime = useVibyRuntime({
        session: {
            id: props.sessionId,
            active: true,
            thinking: false,
            permissionMode: 'default',
            collaborationMode: 'default',
            model: null,
            modelReasoningEffort: null,
            metadata: { driver: 'codex' },
            agentState: { controlledByUser: false },
        } as never,
        isSending: false,
        onSendMessage: vi.fn(),
        onAbort: vi.fn(async () => undefined),
    })

    return (
        <AssistantRuntimeProvider runtime={runtime}>
            <ComposerDraftController sessionId={props.sessionId} />
            <VibyComposer
                model={{
                    sessionId: props.sessionId,
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
                    },
                    handlers: {
                        onPermissionModeChange: vi.fn(),
                    },
                }}
            />
        </AssistantRuntimeProvider>
    )
}

function ComposerPersistenceHarness(props: { sessionId?: string }): React.JSX.Element {
    const sessionId = props.sessionId ?? 'session-1'

    return (
        <I18nProvider>
            <ComposerPersistenceRuntime key={sessionId} sessionId={sessionId} />
        </I18nProvider>
    )
}

describe('VibyComposer draft persistence', () => {
    beforeEach(async () => {
        await resetComposerDraftPersistenceForTests()
    })

    afterEach(() => {
        cleanup()
    })

    it('persists input text and restores it after remount', async () => {
        await preloadI18nForTests()
        const firstRender = render(<ComposerPersistenceHarness />)
        const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement

        fireEvent.change(textarea, {
            target: {
                value: 'draft survives remount',
                selectionStart: 21,
                selectionEnd: 21,
            },
        })

        await waitFor(async () => {
            const result = await readComposerDraftFromIndexedDb('session-1', Date.now())
            expect(result.value).toBe('draft survives remount')
        })

        firstRender.unmount()

        render(<ComposerPersistenceHarness />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('draft survives remount')
        })
    })

    it('does not leak composer memory state across sessions', async () => {
        await preloadI18nForTests()
        const view = render(<ComposerPersistenceHarness sessionId="session-1" />)
        const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement

        fireEvent.change(textarea, {
            target: {
                value: 'session one only',
                selectionStart: 16,
                selectionEnd: 16,
            },
        })

        await waitFor(async () => {
            const result = await readComposerDraftFromIndexedDb('session-1', Date.now())
            expect(result.value).toBe('session one only')
        })

        view.rerender(<ComposerPersistenceHarness sessionId="session-2" />)

        await waitFor(() => {
            expect(screen.getByPlaceholderText('Type a message...')).toHaveValue('')
        })
    })
})
