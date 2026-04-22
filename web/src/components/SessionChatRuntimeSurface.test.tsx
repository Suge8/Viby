import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { SessionChatRuntimeSurface } from './SessionChatRuntimeSurface'

const vibyThreadHarness = vi.hoisted(() => ({
    props: null as ComponentProps<typeof import('@/components/AssistantChat/VibyThread').VibyThread> | null,
}))
const composerDraftHarness = vi.hoisted(() => ({
    mountCount: 0,
}))

beforeEach(() => {
    vibyThreadHarness.props = null
    composerDraftHarness.mountCount = 0
})

afterEach(() => {
    cleanup()
})

vi.mock('@assistant-ui/react', () => ({
    AssistantRuntimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/assistant-runtime', () => ({
    useVibyRuntime: () => ({}),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

vi.mock('@/lib/attachmentAdapter', () => ({
    getCachedAttachmentAdapter: () => ({}),
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

vi.mock('@/hooks/useDesktopSessionsLayout', () => ({
    useDesktopSessionsLayout: () => true,
}))

vi.mock('@/components/motion/motionPrimitives', () => ({
    MotionReveal: ({ children, className }: { children: ReactNode; className?: string }) => (
        <div data-testid="runtime-motion-reveal" className={className}>
            {children}
        </div>
    ),
}))

vi.mock('@/components/AssistantChat/VibyThread', () => ({
    VibyThread: (props: ComponentProps<typeof import('@/components/AssistantChat/VibyThread').VibyThread>) => {
        vibyThreadHarness.props = props
        return <div data-testid="runtime-thread" />
    },
}))

vi.mock('@/components/AssistantChat/ComposerDraftController', () => ({
    ComposerDraftController: () => {
        composerDraftHarness.mountCount += 1
        return null
    },
}))

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
            driver: 'codex',
        },
        agentState: {
            controlledByUser: false,
        },
        ...overrides,
    } as Session
}

function createProps(
    overrides?: Partial<ComponentProps<typeof SessionChatRuntimeSurface>>
): ComponentProps<typeof SessionChatRuntimeSurface> {
    return {
        model: {
            api: null as never,
            session: createSession(),
            composerAnchorTop: 0,
            composerHeight: 72,
            messageState: {
                messages: [],
                warning: null,
                hasMore: false,
                isLoading: false,
                isLoadingMore: false,
                isSending: false,
                atBottom: true,
                pendingCount: 0,
                messagesVersion: 0,
                pendingReply: null,
                stream: null,
                streamVersion: 0,
            },
            onAbort: vi.fn(async () => undefined),
            onAtBottomChange: vi.fn(),
            onFlushPending: vi.fn(),
            onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
            onRefresh: vi.fn(),
            onRetryMessage: vi.fn(),
            onSend: vi.fn(),
            allowSendWhenInactive: true,
        },
        ...overrides,
    }
}

describe('SessionChatRuntimeSurface', () => {
    it('mounts composer draft persistence on the active chat surface', () => {
        render(<SessionChatRuntimeSurface {...createProps()} />)

        expect(composerDraftHarness.mountCount).toBe(1)
        expect(vibyThreadHarness.props?.messageState.messagesVersion).toBe(0)
        expect(vibyThreadHarness.props?.messageState.pendingReply).toBeNull()
    })

    it('keeps the transcript runtime surface on a static layout wrapper instead of a reveal motion owner', () => {
        render(<SessionChatRuntimeSurface {...createProps()} />)

        expect(screen.queryByTestId('runtime-motion-reveal')).not.toBeInTheDocument()
        expect(screen.getByTestId('runtime-thread')).toBeInTheDocument()
    })

    it('keeps resumable closed sessions interactive so the composer can trigger resume', () => {
        render(
            <SessionChatRuntimeSurface
                {...createProps({
                    model: {
                        ...createProps().model,
                        session: createSession({ active: false }),
                        messageState: {
                            messages: [],
                            warning: null,
                            hasMore: false,
                            isLoading: false,
                            isLoadingMore: false,
                            isSending: false,
                            atBottom: true,
                            pendingCount: 0,
                            messagesVersion: 1,
                            pendingReply: null,
                            stream: null,
                            streamVersion: 0,
                        },
                        allowSendWhenInactive: true,
                    },
                })}
            />
        )

        expect(screen.getByTestId('runtime-thread')).toBeInTheDocument()
        expect(vibyThreadHarness.props?.session.disabled).toBe(false)
        expect(vibyThreadHarness.props?.messageState.isLoading).toBe(false)
    })

    it('keeps non-resumable inactive sessions read-only', () => {
        render(
            <SessionChatRuntimeSurface
                {...createProps({
                    model: {
                        ...createProps().model,
                        session: createSession({ active: false }),
                        messageState: {
                            messages: [],
                            warning: null,
                            hasMore: false,
                            isLoading: false,
                            isLoadingMore: false,
                            isSending: false,
                            atBottom: true,
                            pendingCount: 0,
                            messagesVersion: 1,
                            pendingReply: null,
                            stream: null,
                            streamVersion: 0,
                        },
                        allowSendWhenInactive: false,
                    },
                })}
            />
        )

        expect(vibyThreadHarness.props?.session.disabled).toBe(true)
    })

    it('skips composer draft persistence for retained snapshots', () => {
        render(
            <SessionChatRuntimeSurface
                {...createProps({
                    persistComposerDraft: false,
                })}
            />
        )

        expect(composerDraftHarness.mountCount).toBe(0)
    })
})
