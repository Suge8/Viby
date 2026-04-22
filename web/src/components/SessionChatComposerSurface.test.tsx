import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionChatComposerSurface } from './SessionChatComposerSurface'
import type { SessionChatComposerSurfaceProps } from './sessionChatWorkspaceTypes'

const harness = vi.hoisted(() => ({
    useSessionLiveConfigControlsOptions: null as Record<string, unknown> | null,
    vibyComposerModel: null as Record<string, unknown> | null,
}))

vi.mock('@/components/AssistantChat/assistantReplyingPhase', () => ({
    resolveAssistantReplyingPhase: () => null,
}))

vi.mock('@/components/useSessionLiveConfigControls', () => ({
    useSessionLiveConfigControls: (options: Record<string, unknown>) => {
        harness.useSessionLiveConfigControlsOptions = options
        return {
            composerConfig: {
                permissionMode: 'default',
            },
            composerHandlers: {
                autocompleteRefreshKey: options.autocompleteRefreshKey,
            },
        }
    },
}))

vi.mock('@/components/AssistantChat/VibyComposer', () => ({
    VibyComposer: (props: { model: Record<string, unknown> }) => {
        harness.vibyComposerModel = props.model
        return <div data-testid="viby-composer" />
    },
}))

vi.mock('@/hooks/queries/useRuntimeAgentAvailability', () => ({
    useRuntimeAgentAvailability: () => ({
        agents: [
            { driver: 'claude', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
            { driver: 'codex', status: 'ready', resolution: 'none', code: 'ready', detectedAt: 1 },
        ],
        isLoading: false,
        error: null,
        refetch: vi.fn(async () => undefined),
    }),
}))

describe('SessionChatComposerSurface', () => {
    it('passes the autocomplete refresh key through to live controls and the composer model', () => {
        const model: SessionChatComposerSurfaceProps['model'] = {
            api: {} as SessionChatComposerSurfaceProps['model']['api'],
            session: {
                id: 'session-1',
                active: true,
                thinking: false,
                permissionMode: 'default',
                collaborationMode: 'default',
                model: null,
                modelReasoningEffort: null,
                metadata: {
                    driver: 'codex',
                    path: '/tmp/project',
                    host: 'localhost',
                },
                agentState: {
                    controlledByUser: false,
                    requests: {},
                    completedRequests: {},
                },
            } as SessionChatComposerSurfaceProps['model']['session'],
            runtimeOptions: {
                liveConfigSupport: {
                    isRemoteManaged: true,
                    canChangePermissionMode: true,
                    canChangeCollaborationMode: true,
                    canChangeModel: true,
                    canChangeModelReasoningEffort: true,
                },
                autocompleteRefreshKey: 42,
            },
            isSending: false,
            pendingReply: null,
            onSwitchSessionDriver: vi.fn(async () => undefined),
            isSwitchingSessionDriver: false,
            allowSendWhenInactive: false,
            attachmentsSupported: true,
            disabled: false,
        }

        render(<SessionChatComposerSurface model={model} />)

        expect(harness.useSessionLiveConfigControlsOptions?.autocompleteRefreshKey).toBe(42)
        expect(
            (harness.vibyComposerModel?.handlers as { autocompleteRefreshKey?: number } | undefined)
                ?.autocompleteRefreshKey
        ).toBe(42)
    })
})
