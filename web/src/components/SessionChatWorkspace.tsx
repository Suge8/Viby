import { QueuedMessagesBar } from '@/components/AssistantChat/QueuedMessagesBar'
import { SessionChatComposerShell } from '@/components/SessionChatComposerShell'
import { SessionChatComposerSurface } from '@/components/SessionChatComposerSurface'
import { SessionChatLocalNoticeStack } from '@/components/SessionChatLocalNoticeStack'
import { SessionChatRuntimeSurface } from '@/components/SessionChatRuntimeSurface'
import type { SessionChatWorkspaceProps } from '@/components/sessionChatWorkspaceTypes'
import { useSessionChatWorkspaceModel } from '@/components/useSessionChatWorkspaceModel'

export default function SessionChatWorkspace(props: SessionChatWorkspaceProps): React.JSX.Element {
    const {
        chatLayoutStyle,
        composerRef,
        composerSurfaceModel,
        isStandalone,
        isKeyboardOpen,
        localNotices,
        persistComposerDraft,
        runtimeSurfaceModel,
    } = useSessionChatWorkspaceModel(props)

    return (
        <div
            className="session-chat-layout ds-chat-shell flex-1 min-h-0"
            data-chat-keyboard-open={isKeyboardOpen ? 'true' : 'false'}
            data-chat-standalone={isStandalone ? 'true' : 'false'}
            style={chatLayoutStyle}
        >
            <SessionChatRuntimeSurface
                key={props.session.id}
                model={runtimeSurfaceModel}
                persistComposerDraft={persistComposerDraft}
            >
                <SessionChatComposerShell containerRef={composerRef}>
                    <SessionChatLocalNoticeStack notices={localNotices} />
                    <QueuedMessagesBar
                        api={props.api}
                        sessionId={props.session.id}
                        messages={props.messageState.messages}
                        pending={props.messageState.pending}
                    />
                    <SessionChatComposerSurface model={composerSurfaceModel} />
                </SessionChatComposerShell>
            </SessionChatRuntimeSurface>
        </div>
    )
}
