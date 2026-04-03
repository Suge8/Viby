import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { SessionChat } from './SessionChat'

const harness = vi.hoisted(() => ({
    abortSession: vi.fn(async () => undefined),
    switchSessionDriver: vi.fn(async () => undefined),
    navigate: vi.fn(),
    lastHeaderProps: null as Record<string, unknown> | null,
    lastWorkspaceProps: null as Record<string, unknown> | null,
    loadSessionFilesRouteModule: vi.fn(async () => undefined),
    preloadSessionChatWorkspaceSurfaces: vi.fn(async () => undefined),
    preloadSessionTerminalExperience: vi.fn(async () => undefined),
    runPreloadedNavigation: vi.fn(),
}))

function renderWorkspace(props: Record<string, unknown>): React.JSX.Element {
    harness.lastWorkspaceProps = props
    return (
        <div>
            <button
                type="button"
                data-testid="workspace-abort"
                onClick={() => void ((props.actions as { onAbort: () => Promise<void> }).onAbort)()}
            >
                abort
            </button>
            <button
                type="button"
                data-testid="workspace-switch"
                onClick={() => void ((props.actions as { onSwitchSessionDriver: () => Promise<void> }).onSwitchSessionDriver)()}
            >
                switch
            </button>
        </div>
    )
}

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => harness.navigate
}))

vi.mock('@/lib/navigationTransition', () => ({
    runPreloadedNavigation: async (
        preload: (() => Promise<unknown>) | Promise<unknown>,
        commit: () => void,
        recoveryHref: string
    ) => {
        harness.runPreloadedNavigation(preload, commit, recoveryHref)
        try {
            await (typeof preload === 'function' ? preload() : preload)
        } catch {
        }
        commit()
    }
}))

vi.mock('@/routes/sessions/sessionRoutePreload', () => ({
    loadSessionChatWorkspaceModule: vi.fn(async () => ({ default: renderWorkspace })),
    loadSessionFilesRouteModule: () => harness.loadSessionFilesRouteModule(),
    preloadSessionTerminalExperience: () => harness.preloadSessionTerminalExperience()
}))

vi.mock('@/components/sessionChatWorkspaceModules', () => ({
    preloadSessionChatWorkspaceSurfaces: () => harness.preloadSessionChatWorkspaceSurfaces()
}))

vi.mock('@/components/SessionChatWorkspace', () => ({
    default: renderWorkspace
}))

vi.mock('@/components/SessionHeader', () => ({
    SessionHeader: (props: Record<string, unknown>) => {
        harness.lastHeaderProps = props
        return <div data-testid="session-header" />
    }
}))

vi.mock('@/components/ProjectPanel', () => ({
    ProjectPanel: () => <div data-testid="project-panel" />
}))

vi.mock('@/components/MemberControlBanner', () => ({
    MemberControlBanner: () => <div data-testid="member-control-banner" />
}))

vi.mock('@/hooks/mutations/useSessionActions', () => ({
    useSessionActions: () => ({
        abortSession: harness.abortSession,
        unarchiveSession: vi.fn(async () => undefined),
        switchSessionDriver: harness.switchSessionDriver,
        isSwitchingSessionDriver: false
    })
}))

afterEach(() => {
    cleanup()
    harness.abortSession.mockClear()
    harness.switchSessionDriver.mockClear()
    harness.navigate.mockClear()
    harness.loadSessionFilesRouteModule.mockClear()
    harness.preloadSessionChatWorkspaceSurfaces.mockClear()
    harness.preloadSessionTerminalExperience.mockClear()
    harness.runPreloadedNavigation.mockClear()
    harness.lastHeaderProps = null
    harness.lastWorkspaceProps = null
})

function createDeferred(): {
    promise: Promise<undefined>
    resolve: () => void
} {
    let resolve!: (value: undefined) => void
    const promise = new Promise<undefined>((done) => {
        resolve = done
    })
    return {
        promise,
        resolve: () => resolve(undefined)
    }
}

function renderSessionChat(options?: {
    active?: boolean
    isDetailPending?: boolean
    hasLoadedLatestMessages?: boolean
    hasWarmSessionSnapshot?: boolean
    messages?: unknown[]
    onRefresh?: () => void
    teamContext?: Record<string, unknown>
}): ReturnType<typeof render> {
    return render(
        <I18nProvider>
            <SessionChat
                api={null as never}
                session={{
                    id: 'session-1',
                    active: options?.active ?? false,
                    thinking: false,
                    permissionMode: 'default',
                    collaborationMode: 'default',
                    model: 'gpt-5.4-mini',
                    modelReasoningEffort: null,
                    metadata: {
                        driver: 'codex',
                        path: '/Users/sugeh/Project/Bao'
                    },
                    agentState: {
                        controlledByUser: false
                    },
                    teamContext: options?.teamContext
                } as never}
                isDetailPending={options?.isDetailPending}
                hasWarmSessionSnapshot={options?.hasWarmSessionSnapshot}
                messages={(options?.messages ?? []) as never}
                messagesWarning={null}
                hasMoreMessages={false}
                isLoadingMessages={false}
                isLoadingMoreMessages={false}
                isSending={false}
                isResumingSession={false}
                pendingCount={0}
                hasLoadedLatestMessages={options?.hasLoadedLatestMessages ?? true}
                messagesVersion={0}
                pendingReply={null}
                stream={null}
                streamVersion={0}
                onBack={vi.fn()}
                onRefresh={options?.onRefresh ?? vi.fn()}
                onLoadMore={vi.fn(async () => ({ didLoadOlderMessages: true }))}
                onLoadHistoryUntilPreviousUser={vi.fn(async () => ({ didLoadOlderMessages: true }))}
                onSend={vi.fn()}
                onFlushPending={vi.fn()}
                onAtBottomChange={vi.fn()}
                onRetryMessage={vi.fn()}
            />
        </I18nProvider>
    )
}

describe('SessionChat layout', () => {
    it('keeps the chat root stretched across the available stage width', async () => {
        const { container } = renderSessionChat()
        await screen.findByTestId('workspace-abort')
        const chatRoot = container.firstElementChild
        const chatBody = container.querySelector('.session-chat-page-body')
        const headerNavigation = harness.lastHeaderProps?.navigation as {
            onViewFiles?: () => void
            onViewTerminal?: () => void
        }

        expect(chatRoot).toHaveClass('w-full')
        expect(chatRoot).toHaveClass('h-full')
        expect(chatRoot).not.toHaveClass('flex-1')
        expect(chatRoot).toHaveClass('min-w-0')
        expect(chatRoot).toHaveClass('session-chat-enter-surface')
        expect(chatBody).toHaveClass('session-chat-enter-body')
        expect(headerNavigation.onViewFiles).toBeTypeOf('function')
        expect(headerNavigation.onViewTerminal).toBeUndefined()
        expect(harness.lastWorkspaceProps?.messageState).toMatchObject({
            messages: [],
            hasMore: false,
            isLoading: false,
            isLoadingMore: false,
            isSending: false
        })
    })

    it('does not force a message refresh immediately after aborting', async () => {
        const onRefresh = vi.fn()
        renderSessionChat({ onRefresh })

        fireEvent.click(await screen.findByTestId('workspace-abort'))

        await vi.waitFor(() => {
            expect(harness.abortSession).toHaveBeenCalledTimes(1)
        })
        expect(onRefresh).not.toHaveBeenCalled()
    })

    it('does not force a message refresh immediately after switching drivers', async () => {
        const onRefresh = vi.fn()
        renderSessionChat({ onRefresh })

        fireEvent.click(await screen.findByTestId('workspace-switch'))

        await vi.waitFor(() => {
            expect(harness.switchSessionDriver).toHaveBeenCalledWith('claude')
        })
        expect(onRefresh).not.toHaveBeenCalled()
    })

    it('does not mutate document-level route layout flags while mounted', () => {
        renderSessionChat()

        expect(document.body.dataset.vibyRoute).toBeUndefined()
        expect(document.documentElement.dataset.vibyRoute).toBeUndefined()
    })

    it('keeps the stable chat shell visible while detail data is still pending', () => {
        renderSessionChat({ isDetailPending: true })

        expect(screen.getAllByTestId('session-header')).toHaveLength(1)
        expect(screen.getByTestId('session-chat-detail-pending')).toBeInTheDocument()
        expect(screen.queryByTestId('workspace-abort')).not.toBeInTheDocument()
    })

    it('renders the workspace as soon as there are messages to show, even if detail is still reconciling', async () => {
        renderSessionChat({
            isDetailPending: true,
            messages: [{ id: 'message-1' }]
        })

        expect(await screen.findAllByTestId('workspace-abort')).toHaveLength(1)
        expect(screen.queryByTestId('session-chat-detail-pending')).not.toBeInTheDocument()
    })

    it('renders the manager project panel from teamContext instead of the legacy manager surface path', async () => {
        renderSessionChat({
            teamContext: {
                projectId: 'project-1',
                sessionRole: 'manager',
                managerSessionId: 'session-1',
                projectStatus: 'active'
            }
        })

        expect(await screen.findByTestId('project-panel')).toBeInTheDocument()
        expect(screen.queryByTestId('team-panel')).not.toBeInTheDocument()
    })

    it('renders the member control banner for member sessions', async () => {
        renderSessionChat({
            teamContext: {
                projectId: 'project-1',
                sessionRole: 'member',
                managerSessionId: 'manager-session-1',
                memberId: 'member-1',
                controlledByUser: 'manager',
                projectStatus: 'active'
            }
        })

        expect(await screen.findByTestId('member-control-banner')).toBeInTheDocument()
        expect(screen.queryByTestId('team-panel')).not.toBeInTheDocument()
    })

    it('keeps the stable chat shell visible until the initial message snapshot is ready', () => {
        renderSessionChat({
            hasLoadedLatestMessages: false,
            messages: []
        })

        expect(screen.getByTestId('session-chat-detail-pending')).toBeInTheDocument()
        expect(screen.queryByTestId('workspace-abort')).not.toBeInTheDocument()
    })

    it('skips the detail pending shell when a warm session snapshot already exists', async () => {
        renderSessionChat({
            isDetailPending: true,
            hasWarmSessionSnapshot: true,
            hasLoadedLatestMessages: false,
            messages: []
        })

        expect(await screen.findAllByTestId('workspace-abort')).toHaveLength(1)
        expect(screen.queryByTestId('session-chat-detail-pending')).not.toBeInTheDocument()
    })

    it('exposes terminal navigation through the header only for active sessions', () => {
        renderSessionChat({ active: true })

        const headerNavigation = harness.lastHeaderProps?.navigation as {
            onViewFiles?: () => void
            onViewTerminal?: () => void
        }

        expect(headerNavigation.onViewFiles).toBeTypeOf('function')
        expect(headerNavigation.onViewTerminal).toBeTypeOf('function')
    })

    it('waits for the files route module preload before navigating from the header', async () => {
        const deferred = createDeferred()
        harness.loadSessionFilesRouteModule.mockReturnValueOnce(deferred.promise)
        renderSessionChat()

        const headerNavigation = harness.lastHeaderProps?.navigation as {
            onViewFiles?: () => void
        }

        headerNavigation.onViewFiles?.()

        expect(harness.loadSessionFilesRouteModule).toHaveBeenCalledTimes(1)
        expect(harness.navigate).not.toHaveBeenCalled()

        deferred.resolve()

        await vi.waitFor(() => {
            expect(harness.navigate).toHaveBeenCalledWith({
                to: '/sessions/$sessionId/files',
                params: { sessionId: 'session-1' }
            })
        })
        expect(harness.runPreloadedNavigation).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/sessions/session-1/files'
        )
    })

    it('waits for the terminal route module preload before navigating from the header', async () => {
        const deferred = createDeferred()
        harness.preloadSessionTerminalExperience.mockReturnValueOnce(deferred.promise)
        renderSessionChat({ active: true })

        const headerNavigation = harness.lastHeaderProps?.navigation as {
            onViewTerminal?: () => void
        }

        headerNavigation.onViewTerminal?.()

        expect(harness.preloadSessionTerminalExperience).toHaveBeenCalledTimes(1)
        expect(harness.navigate).not.toHaveBeenCalled()

        deferred.resolve()

        await vi.waitFor(() => {
            expect(harness.navigate).toHaveBeenCalledWith({
                to: '/sessions/$sessionId/terminal',
                params: { sessionId: 'session-1' }
            })
        })
        expect(harness.runPreloadedNavigation).toHaveBeenLastCalledWith(
            expect.any(Promise),
            expect.any(Function),
            '/sessions/session-1/terminal'
        )
    })
})
