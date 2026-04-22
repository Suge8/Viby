import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { ActiveInteractiveRequestOwner } from '@/components/interactive-request/ActiveInteractiveRequestOwner'
import { createTestSession } from '@/test/sessionFactories'
import type { DecryptedMessage } from '@/types/api'

const platformHarness = vi.hoisted(() => ({
    isTouch: false,
}))
const layoutHarness = vi.hoisted(() => ({
    isDesktop: true,
}))

vi.mock('@/components/ToolCard/markdownContent', () => ({
    ToolMarkdownQuestion: ({ text }: { text: string }) => <div>{text}</div>,
}))

vi.mock('@/components/ToolCard/toolQuestionOptionRow', () => ({
    ToolQuestionOptionRow: ({ title, onClick }: { title: string; onClick: () => void }) => (
        <button type="button" onClick={onClick}>
            {title}
        </button>
    ),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: platformHarness.isTouch,
        haptic: {
            impact: vi.fn(),
            notification: vi.fn(),
            selection: vi.fn(),
        },
    }),
}))

vi.mock('@/hooks/useDesktopSessionsLayout', () => ({
    useDesktopSessionsLayout: () => layoutHarness.isDesktop,
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) =>
            (
                ({
                    'session.state.awaitingInput': 'Awaiting input',
                    'tool.questionsAnswers': 'Questions & Answers',
                    'tool.waitingForApproval': 'Waiting for approval…',
                    'tool.question': 'Question',
                    'tool.selectOption': 'Select an option',
                    'tool.requestUserInput.noteLabel': 'Note',
                    'tool.requestUserInput.notePlaceholder': 'Add a note…',
                    'tool.requestUserInput.textPlaceholder': 'Type your answer…',
                    'tool.askUserQuestion.placeholder': 'Type your answer…',
                    'tool.submit': 'Submit',
                    'tool.planExecution.badge': 'Plan ready',
                    'tool.planExecution.description': 'Switch to Default mode and start implementation from this plan.',
                    'tool.planExecution.execute': 'Execute this plan',
                    'tool.planExecution.continue': 'Continue planning',
                    'misc.previous': 'Previous',
                    'misc.next': 'Next',
                    'misc.loading': 'Loading…',
                    'tool.allow': 'Allow',
                    'tool.yes': 'Yes',
                    'tool.yesForSession': 'Yes for session',
                    'tool.abortLabel': 'Abort',
                    'tool.deny': 'Deny',
                    'tool.allowAll': 'Allow all edits',
                }) as Record<string, string>
            )[key] ?? key,
    }),
}))

beforeEach(() => {
    document.body.innerHTML = ''
    platformHarness.isTouch = false
    layoutHarness.isDesktop = true
})

afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
})

function createSurfaceRef(): RefObject<HTMLDivElement | null> {
    const element = document.createElement('div')
    Object.defineProperty(element, 'getBoundingClientRect', {
        value: () =>
            ({
                left: 320,
                top: 96,
                width: 960,
                height: 720,
                right: 1280,
                bottom: 816,
            }) as DOMRect,
    })
    document.body.appendChild(element)
    return { current: element }
}

function createOwnerModel(options: {
    api: ApiClient
    session: ReturnType<typeof createTestSession>
    messages?: DecryptedMessage[]
    composerHeight?: number
    isReplying?: boolean
    onSend?: (text: string) => void
}) {
    return {
        api: options.api,
        composerHeight: options.composerHeight ?? 72,
        session: options.session,
        messages: options.messages ?? [],
        isReplying: options.isReplying ?? false,
        onSend: options.onSend ?? vi.fn(),
    }
}

describe('ActiveInteractiveRequestOwner', () => {
    it('renders request_user_input in the overlay owner and submits nested answers', async () => {
        const approvePermission = vi.fn(async () => undefined)
        const api = {
            approvePermission,
        } as Partial<ApiClient> as ApiClient
        const session = createTestSession({
            id: 'session-1',
            agentState: {
                controlledByUser: false,
                requests: {
                    'request-1': {
                        tool: 'request_user_input',
                        arguments: {
                            questions: [
                                {
                                    id: 'confirm',
                                    header: 'Confirm',
                                    question: 'Proceed?',
                                    options: [{ label: 'Yes', description: 'Continue' }],
                                },
                            ],
                        },
                        createdAt: 10,
                    },
                },
                completedRequests: {},
            },
        })

        render(
            <ActiveInteractiveRequestOwner surfaceRef={createSurfaceRef()} model={createOwnerModel({ api, session })} />
        )

        expect(screen.getByTestId('interactive-request-owner')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
        fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

        expect(approvePermission).toHaveBeenCalledWith('session-1', 'request-1', {
            answers: {
                confirm: {
                    answers: ['Yes'],
                },
            },
        })
    })

    it('renders permission requests through the same owner and routes codex decisions', async () => {
        const approvePermission = vi.fn(async () => undefined)
        const denyPermission = vi.fn(async () => undefined)
        const api = {
            approvePermission,
            denyPermission,
        } as Partial<ApiClient> as ApiClient
        const session = createTestSession({
            id: 'session-2',
            agentState: {
                controlledByUser: false,
                requests: {
                    'permission-1': {
                        tool: 'Bash',
                        arguments: { cmd: 'ls -la' },
                        createdAt: 10,
                    },
                },
                completedRequests: {},
            },
        })

        render(
            <ActiveInteractiveRequestOwner surfaceRef={createSurfaceRef()} model={createOwnerModel({ api, session })} />
        )
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }))

        expect(approvePermission).toHaveBeenCalledWith('session-2', 'permission-1', {
            decision: 'approved',
        })
        expect(denyPermission).not.toHaveBeenCalled()
    })

    it('shows a centered plan execution prompt and switches to default mode before sending the implementation turn', async () => {
        const setCollaborationMode = vi.fn(async () => session)
        const onSend = vi.fn()
        const api = {
            setCollaborationMode,
        } as unknown as ApiClient
        const session = createTestSession({
            id: 'session-3',
            collaborationMode: 'plan',
            active: true,
            thinking: false,
            agentState: {
                controlledByUser: false,
                requests: {},
                completedRequests: {},
            },
        })
        const messages: DecryptedMessage[] = [
            {
                id: 'user-1',
                seq: 1,
                localId: null,
                createdAt: 10,
                content: {
                    role: 'user',
                    content: { type: 'text', text: '开始计划' },
                },
            },
            {
                id: 'agent-1',
                seq: 2,
                localId: null,
                createdAt: 20,
                content: {
                    role: 'agent',
                    content: {
                        type: 'codex',
                        data: {
                            type: 'message',
                            message: '<proposed_plan>\n# Minimal plan\n\nRun a small smoke test.\n</proposed_plan>',
                        },
                    },
                },
            },
        ]

        render(
            <ActiveInteractiveRequestOwner
                surfaceRef={createSurfaceRef()}
                model={createOwnerModel({ api, session, messages, onSend })}
            />
        )

        expect(screen.getByTestId('plan-execution-owner')).toBeInTheDocument()
        expect(screen.getByText('Minimal plan')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Execute this plan' }))

        await waitFor(() => {
            expect(setCollaborationMode).toHaveBeenCalledWith('session-3', 'default')
            expect(onSend).toHaveBeenCalledWith('Implement the plan.')
        })
    })

    it('hides the plan execution prompt once a newer user turn starts after the proposed plan', () => {
        const api = {} as Partial<ApiClient> as ApiClient
        const session = createTestSession({
            id: 'session-4',
            collaborationMode: 'plan',
            active: true,
            thinking: false,
            agentState: {
                controlledByUser: false,
                requests: {},
                completedRequests: {},
            },
        })
        const messages: DecryptedMessage[] = [
            {
                id: 'user-1',
                seq: 1,
                localId: null,
                createdAt: 10,
                content: {
                    role: 'user',
                    content: { type: 'text', text: '开始计划' },
                },
            },
            {
                id: 'agent-1',
                seq: 2,
                localId: null,
                createdAt: 20,
                content: {
                    role: 'agent',
                    content: {
                        type: 'codex',
                        data: {
                            type: 'message',
                            message: '<proposed_plan>\n# Minimal plan\n\nRun a small smoke test.\n</proposed_plan>',
                        },
                    },
                },
            },
            {
                id: 'user-2',
                seq: 3,
                localId: null,
                createdAt: 30,
                content: {
                    role: 'user',
                    content: { type: 'text', text: '那我怎么退出planmode' },
                },
            },
        ]

        render(
            <ActiveInteractiveRequestOwner
                surfaceRef={createSurfaceRef()}
                model={createOwnerModel({ api, session, messages })}
            />
        )

        expect(screen.queryByTestId('plan-execution-owner')).not.toBeInTheDocument()
    })

    it('uses the mobile surface layout for touch-first devices', () => {
        platformHarness.isTouch = true
        layoutHarness.isDesktop = false
        const api = {} as Partial<ApiClient> as ApiClient
        const session = createTestSession({
            id: 'session-5',
            agentState: {
                controlledByUser: false,
                requests: {
                    'permission-1': {
                        tool: 'Bash',
                        arguments: { cmd: 'pwd' },
                        createdAt: 10,
                    },
                },
                completedRequests: {},
            },
        })

        render(
            <ActiveInteractiveRequestOwner
                surfaceRef={createSurfaceRef()}
                model={createOwnerModel({ api, session, composerHeight: 64 })}
            />
        )

        expect(screen.getByTestId('interactive-request-owner')).toHaveStyle({ maxHeight: 'min(80dvh, 100%)' })
    })
})
