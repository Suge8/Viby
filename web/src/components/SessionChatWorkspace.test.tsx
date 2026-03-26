import { cleanup, fireEvent, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoticeProvider } from '@/lib/notice-center'
import { MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY } from '@/lib/messageWindowWarnings'
import { renderWithI18n } from '@/test/i18n'
import type { Session } from '@/types/api'
import SessionChatWorkspace from './SessionChatWorkspace'

const viewportLayoutHarness = vi.hoisted(() => ({
    value: {
        isStandalone: true,
        isKeyboardOpen: false,
        bottomInsetPx: 0,
        floatingControlBottomInsetPx: 0
    }
}))

const sessionActionHarness = vi.hoisted(() => ({
    invalidateQueries: vi.fn(async () => undefined),
    unarchiveSession: vi.fn(async () => undefined)
}))

beforeEach(() => {
    viewportLayoutHarness.value = {
        isStandalone: true,
        isKeyboardOpen: false,
        bottomInsetPx: 0,
        floatingControlBottomInsetPx: 0
    }
    sessionActionHarness.invalidateQueries.mockReset()
    sessionActionHarness.unarchiveSession.mockReset()
})

afterEach(() => {
    cleanup()
})

vi.mock('@assistant-ui/react', () => ({
    AssistantRuntimeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/lib/assistant-runtime', () => ({
    useVibyRuntime: () => ({})
}))

vi.mock('@/lib/attachmentAdapter', () => ({
    createAttachmentAdapter: () => ({})
}))

vi.mock('@/components/AssistantChat/useChatViewportLayout', () => ({
    useChatViewportLayout: () => viewportLayoutHarness.value
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        haptic: {
            notification: vi.fn()
        }
    })
}))

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({
        invalidateQueries: sessionActionHarness.invalidateQueries
    })
}))

vi.mock('@/hooks/useElementHeight', () => ({
    useElementHeight: () => 92
}))

vi.mock('@/components/AssistantChat/VibyThread', () => ({
    VibyThread: () => <div data-testid="workspace-thread" />
}))

vi.mock('@/components/AssistantChat/VibyComposer', () => ({
    VibyComposer: () => <div data-testid="workspace-composer" />
}))

vi.mock('@/components/AssistantChat/ComposerDraftController', () => ({
    ComposerDraftController: () => null
}))

vi.mock('@/components/ui/animated-list', () => ({
    AnimatedList: (props: { children: React.ReactNode }) => <div>{props.children}</div>
}))

vi.mock('@/components/ui/blur-fade', () => ({
    BlurFade: (props: { children: React.ReactNode }) => <div>{props.children}</div>
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn()
}))

const DEFAULT_LIVE_CONFIG_SUPPORT = {
    canChangePermissionMode: true,
    canChangeCollaborationMode: true,
    canChangeModel: true,
    canChangeModelReasoningEffort: true,
    isRemoteManaged: true
} as const

function createSession(overrides?: Partial<Session>): Session {
    return {
        id: 'session-1',
        active: true,
        thinking: false,
        permissionMode: 'default',
        collaborationMode: 'default',
        model: 'gpt-5.4-mini',
        modelReasoningEffort: null,
        metadata: {
            flavor: 'codex'
        },
        agentState: {
            controlledByUser: false
        },
        ...overrides
    } as Session
}

function createDefaultMessageState() {
    return {
        messages: [],
        warning: null,
        hasMore: false,
        isLoading: false,
        isLoadingMore: false,
        isSending: false,
        pendingCount: 0,
        messagesVersion: 0,
        pendingReply: null,
        stream: null,
        streamVersion: 0,
    }
}

function createWorkspaceProps(overrides?: Partial<ComponentProps<typeof SessionChatWorkspace>>): ComponentProps<typeof SessionChatWorkspace> {
    return {
        api: null as never,
        session: createSession(),
        messageState: createDefaultMessageState(),
        actions: {
            onRefresh: vi.fn(),
            onLoadMore: vi.fn(async () => ({ didLoadOlderMessages: true })),
            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
            onSend: vi.fn(),
            onFlushPending: vi.fn(),
            onAtBottomChange: vi.fn(),
            onAbort: vi.fn(async () => undefined),
            onUnarchiveSession: sessionActionHarness.unarchiveSession,
            onSwitchToRemote: vi.fn(async () => undefined),
        },
        runtimeOptions: {
            liveConfigSupport: DEFAULT_LIVE_CONFIG_SUPPORT,
        },
        ...overrides
    }
}

describe('SessionChatWorkspace layout', () => {
    it('uses a dedicated chat shell row for the thread and composer', async () => {
        const { container } = await renderWithI18n(
            <NoticeProvider>
                <SessionChatWorkspace {...createWorkspaceProps()} />
            </NoticeProvider>
        )

        const shell = container.firstElementChild

        expect(shell).toHaveClass('ds-chat-shell')
        expect(shell).toHaveClass('flex-1')
        expect(await screen.findByTestId('workspace-thread')).toBeInTheDocument()
        expect(await screen.findByTestId('workspace-composer')).toBeInTheDocument()
    })

    it('projects standalone and keyboard viewport state onto the chat shell root', async () => {
        viewportLayoutHarness.value = {
            isStandalone: true,
            isKeyboardOpen: true,
            bottomInsetPx: 320,
            floatingControlBottomInsetPx: 288
        }

        const { container } = await renderWithI18n(
            <NoticeProvider>
                <SessionChatWorkspace {...createWorkspaceProps()} />
            </NoticeProvider>
        )

        const shell = container.firstElementChild as HTMLElement

        expect(shell.dataset.chatStandalone).toBe('true')
        expect(shell.dataset.chatKeyboardOpen).toBe('true')
        expect(shell.style.getPropertyValue('--chat-composer-offset-bottom')).toBe('320px')
        expect(shell.style.getPropertyValue('--chat-composer-reserved-space')).toBe('92px')
        expect(shell.style.getPropertyValue('--chat-floating-control-offset-bottom')).toBe('288px')
    })

    it('keeps closed-session recovery guidance local to the composer area', async () => {
        await renderWithI18n(
            <NoticeProvider>
                <SessionChatWorkspace
                    {...createWorkspaceProps({
                        session: createSession({ active: false }),
                        messageState: {
                            ...createDefaultMessageState(),
                            warning: MESSAGE_WINDOW_PENDING_OVERFLOW_WARNING_KEY
                        }
                    })}
                />
            </NoticeProvider>
        )

        expect(
            screen.getByText(/^(chat\.messagesWarning\.pendingOverflow|New replies arrived while you were away\. Scroll to the bottom to refresh\.)$/)
        ).toBeInTheDocument()
        expect(screen.queryByText(/^(chat\.inactive\.banner|This session is inactive\. Send a new message to ask an online machine to resume it\.)$/)).not.toBeInTheDocument()
    })

    it('renders an archived-session inline notice with a local restore action', async () => {
        await renderWithI18n(
            <NoticeProvider>
                <SessionChatWorkspace
                    {...createWorkspaceProps({
                        session: createSession({
                            active: false,
                            metadata: {
                                flavor: 'codex',
                                lifecycleState: 'archived'
                            } as never
                        })
                    })}
                />
            </NoticeProvider>
        )

        expect(
            screen.getByText(/^(chat\.archived\.banner|This session is archived\. Sending a new message will restore it automatically, or you can restore it now\.)$/)
        ).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /^(session\.action\.unarchive|Restore)$/ }))

        expect(sessionActionHarness.unarchiveSession).toHaveBeenCalledOnce()
    })
})
