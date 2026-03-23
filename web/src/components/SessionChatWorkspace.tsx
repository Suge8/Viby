import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { ComposerDraftController } from '@/components/AssistantChat/ComposerDraftController'
import { VibyComposer } from '@/components/AssistantChat/VibyComposer'
import { VibyThread } from '@/components/AssistantChat/VibyThread'
import { SessionChatLocalNoticeStack } from '@/components/SessionChatLocalNoticeStack'
import {
    useSessionChatWorkspaceModel,
    type SessionChatWorkspaceProps
} from '@/components/useSessionChatWorkspaceModel'

export default function SessionChatWorkspace(props: SessionChatWorkspaceProps): React.JSX.Element {
    const model = useSessionChatWorkspaceModel(props)

    return (
        <AssistantRuntimeProvider runtime={model.assistantRuntime}>
            <ComposerDraftController sessionId={props.session.id} />
            <div
                className="session-chat-layout ds-chat-shell flex-1 min-h-0"
                data-chat-keyboard-open={model.viewportState.isKeyboardOpen ? 'true' : 'false'}
                data-chat-standalone={model.viewportState.isStandalone ? 'true' : 'false'}
                style={model.chatLayoutStyle}
            >
                <VibyThread
                    key={props.session.id}
                    session={model.threadSession}
                    handlers={model.threadHandlers}
                    state={model.threadState}
                />
                <SessionChatLocalNoticeStack notices={model.localNotices} />
                <VibyComposer
                    model={model.composerModel}
                    key={`composer:${props.session.id}`}
                />
            </div>
        </AssistantRuntimeProvider>
    )
}
