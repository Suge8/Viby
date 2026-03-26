import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { Suspense, lazy } from 'react'
import { SessionChatLocalNoticeStack } from '@/components/SessionChatLocalNoticeStack'
import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'
import {
    useSessionChatWorkspaceModel,
    type SessionChatWorkspaceProps
} from '@/components/useSessionChatWorkspaceModel'

let composerDraftControllerModulePromise: Promise<{ default: typeof import('@/components/AssistantChat/ComposerDraftController').ComposerDraftController }> | null = null
let vibyThreadModulePromise: Promise<{ default: typeof import('@/components/AssistantChat/VibyThread').VibyThread }> | null = null
let vibyComposerModulePromise: Promise<{ default: typeof import('@/components/AssistantChat/VibyComposer').VibyComposer }> | null = null

function loadComposerDraftControllerModule() {
    composerDraftControllerModulePromise ??= import('@/components/AssistantChat/ComposerDraftController').then((module) => ({
        default: module.ComposerDraftController
    }))
    return composerDraftControllerModulePromise
}

function loadVibyThreadModule() {
    vibyThreadModulePromise ??= import('@/components/AssistantChat/VibyThread').then((module) => ({
        default: module.VibyThread
    }))
    return vibyThreadModulePromise
}

function loadVibyComposerModule() {
    vibyComposerModulePromise ??= import('@/components/AssistantChat/VibyComposer').then((module) => ({
        default: module.VibyComposer
    }))
    return vibyComposerModulePromise
}

const LazyComposerDraftController = lazy(loadComposerDraftControllerModule)
const LazyVibyThread = lazy(loadVibyThreadModule)
const LazyVibyComposer = lazy(loadVibyComposerModule)

export default function SessionChatWorkspace(props: SessionChatWorkspaceProps): React.JSX.Element {
    const model = useSessionChatWorkspaceModel(props)

    return (
        <AssistantRuntimeProvider runtime={model.assistantRuntime}>
            <Suspense fallback={null}>
                <LazyComposerDraftController sessionId={props.session.id} />
            </Suspense>
            <div
                className="session-chat-layout ds-chat-shell flex-1 min-h-0"
                data-chat-keyboard-open={model.viewportState.isKeyboardOpen ? 'true' : 'false'}
                data-chat-standalone={model.viewportState.isStandalone ? 'true' : 'false'}
                style={model.chatLayoutStyle}
            >
                <Suspense fallback={<SessionChatWorkspaceThreadFallback />}>
                    <LazyVibyThread
                        key={props.session.id}
                        session={model.threadSession}
                        handlers={model.threadHandlers}
                        state={model.threadState}
                    />
                </Suspense>
                <SessionChatLocalNoticeStack notices={model.localNotices} />
                <Suspense fallback={<SessionChatWorkspaceComposerFallback />}>
                    <LazyVibyComposer
                        model={model.composerModel}
                        key={`composer:${props.session.id}`}
                    />
                </Suspense>
            </div>
        </AssistantRuntimeProvider>
    )
}

function SessionChatWorkspaceThreadFallback(): React.JSX.Element {
    return (
        <div
            data-testid="workspace-thread-fallback"
            className="min-h-0 flex-1 overflow-hidden px-3 pt-3"
        >
            <div className="mx-auto w-full ds-stage-shell">
                <SkeletonRows rows={CHAT_MESSAGE_SKELETON_ROWS} />
            </div>
        </div>
    )
}

function SessionChatWorkspaceComposerFallback(): React.JSX.Element {
    return (
        <div
            data-testid="workspace-composer-fallback"
            className="session-chat-composer-shell ds-composer-shell shrink-0 px-3 pb-3"
        >
            <div className="mx-auto w-full ds-stage-shell">
                <div className="h-24 rounded-[1.5rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)]/85 shadow-[var(--ds-shadow-soft)]" />
            </div>
        </div>
    )
}
