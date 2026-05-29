import { memo, useMemo } from 'react'
import type { VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import { VibyComposer } from '@/components/AssistantChat/VibyComposer'
import type { SessionChatComposerSurfaceProps } from '@/components/sessionChatWorkspaceTypes'
import { useSessionLiveConfigControls } from '@/components/useSessionLiveConfigControls'
import { useRuntimeAgentAvailability } from '@/hooks/queries/useRuntimeAgentAvailability'

function SessionChatComposerSurfaceInner(props: SessionChatComposerSurfaceProps): React.JSX.Element {
    const {
        model: {
            api,
            session,
            runtimeOptions,
            isSending,
            sendPending,
            onSwitchSessionDriver,
            isSwitchingSessionDriver,
            allowSendWhenInactive,
            attachmentsSupported,
            disabled,
        },
    } = props
    const { agents: agentAvailability } = useRuntimeAgentAvailability(api, session.metadata?.path ?? null)

    const { composerConfig, composerHandlers } = useSessionLiveConfigControls({
        api,
        session,
        liveConfigSupport: runtimeOptions.liveConfigSupport,
        onSwitchSessionDriver,
        isSwitchingSessionDriver,
        agentAvailability: agentAvailability.length > 0 ? agentAvailability : null,
        autocompleteSuggestions: runtimeOptions.autocompleteSuggestions,
        autocompleteRefreshKey: runtimeOptions.autocompleteRefreshKey,
        onSuggestionAction: runtimeOptions.onSuggestionAction,
        attachmentsSupported,
        allowSendWhenInactive,
    })

    const composerModel = useMemo<VibyComposerModel>(
        () => ({
            sessionId: session.id,
            disabled,
            sendPending,
            autocompleteLayout: runtimeOptions.autocompleteLayout,
            config: composerConfig,
            handlers: composerHandlers,
        }),
        [composerConfig, composerHandlers, disabled, runtimeOptions.autocompleteLayout, sendPending, session.id]
    )

    return <VibyComposer model={composerModel} key={`composer:${session.id}`} />
}

export const SessionChatComposerSurface = memo(SessionChatComposerSurfaceInner)
