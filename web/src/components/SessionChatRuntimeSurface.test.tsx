import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@/types/api'
import { SessionChatRuntimeSurface } from './SessionChatRuntimeSurface'

const vibyThreadHarness = vi.hoisted(() => ({
    props: null as ComponentProps<typeof import('@/components/AssistantChat/VibyThread').VibyThread> | null
}))
const composerDraftHarness = vi.hoisted(() => ({
    mountCount: 0
}))

beforeEach(() => {
    vibyThreadHarness.props = null
    composerDraftHarness.mountCount = 0
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

vi.mock('@/components/useSessionChatBlocks', () => ({
    useSessionChatBlocks: () => ({
        blocks: [],
        rawMessagesCount: 2,
        normalizedMessagesCount: 2,
        threadMessageIds: ['user:1', 'assistant:2'],
        conversationMessageIds: ['user:1', 'assistant:2'],
        threadMessageOwnerById: new Map([
            ['user:1', 'user:1'],
            ['assistant:2', 'assistant:2']
        ]),
        historyJumpTargetMessageIds: ['user:1']
    })
}))

vi.mock('@/components/AssistantChat/VibyThread', () => ({
    VibyThread: (props: ComponentProps<typeof import('@/components/AssistantChat/VibyThread').VibyThread>) => {
        vibyThreadHarness.props = props
        return <div data-testid="runtime-thread" />
    }
}))

vi.mock('@/components/AssistantChat/ComposerDraftController', () => ({
    ComposerDraftController: () => {
        composerDraftHarness.mountCount += 1
        return null
    }
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
            driver: 'codex'
        },
        agentState: {
            controlledByUser: false
        },
        ...overrides
    } as Session
}

function createProps(overrides?: Partial<ComponentProps<typeof SessionChatRuntimeSurface>>): ComponentProps<typeof SessionChatRuntimeSurface> {
    return {
        workspace: {
            api: null as never,
            session: createSession(),
            messageState: {
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
                streamVersion: 0
            }
        },
        runtime: {
            actions: {
                onAbort: vi.fn(async () => undefined),
                onAtBottomChange: vi.fn(),
                onFlushPending: vi.fn(),
                onLoadHistoryUntilPreviousUser: vi.fn(async () => ({ didLoadOlderMessages: true })),
                onLoadMore: vi.fn(async () => ({ didLoadOlderMessages: true })),
                onRefresh: vi.fn(),
                onRetryMessage: vi.fn(),
                onSend: vi.fn()
            },
            allowSendWhenInactive: true,
            forceScrollToken: 0
        },
        ...overrides
    }
}

describe('SessionChatRuntimeSurface', () => {
    it('pins session entry to the latest message for inactive sessions too', () => {
        render(
            <SessionChatRuntimeSurface
                {...createProps({
                    workspace: {
                        api: null as never,
                        session: createSession({ active: false }),
                        messageState: {
                            messages: [],
                            warning: null,
                            hasMore: false,
                            isLoading: false,
                            isLoadingMore: false,
                            isSending: false,
                            pendingCount: 0,
                            messagesVersion: 1,
                            pendingReply: null,
                            stream: null,
                            streamVersion: 0
                        }
                    }
                })}
            />
        )

        expect(screen.getByTestId('runtime-thread')).toBeInTheDocument()
        expect(vibyThreadHarness.props?.state.pinToBottomOnSessionEntry).toBe(true)
    })

    it('skips composer draft persistence for retained snapshots', () => {
        render(
            <SessionChatRuntimeSurface
                {...createProps({
                    persistComposerDraft: false
                })}
            />
        )

        expect(composerDraftHarness.mountCount).toBe(0)
    })
})
