import type { AttachmentAdapter } from '@assistant-ui/react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { isSessionInteractionDisabled } from '@viby/protocol'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { ComposerDraftController } from '@/components/AssistantChat/ComposerDraftController'
import { VibyThread } from '@/components/AssistantChat/VibyThread'
import { ActiveInteractiveRequestOwner } from '@/components/interactive-request/ActiveInteractiveRequestOwner'
import type { SessionChatRuntimeSurfaceProps } from '@/components/sessionChatWorkspaceTypes'
import { useVibyRuntime } from '@/lib/assistant-runtime'
import type { AttachmentAdapterModule } from '@/lib/attachmentAdapter'
import { enterControllerSurface } from '@/lib/controllerOwnershipProbe'

let attachmentAdapterModule: AttachmentAdapterModule | null = null
let attachmentAdapterModulePromise: Promise<AttachmentAdapterModule> | null = null

function loadAttachmentAdapterModule(): Promise<AttachmentAdapterModule> {
    if (attachmentAdapterModule) {
        return Promise.resolve(attachmentAdapterModule)
    }

    attachmentAdapterModulePromise ??= import('@/lib/attachmentAdapter').then((module) => {
        attachmentAdapterModule = module
        return module
    })
    return attachmentAdapterModulePromise
}

function SessionChatRuntimeSurfaceInner(props: SessionChatRuntimeSurfaceProps): React.JSX.Element {
    const {
        model: {
            api,
            session,
            composerAnchorTop,
            composerHeight,
            messageState,
            onAbort,
            onAtBottomChange,
            onFlushPending,
            onLoadHistoryUntilPreviousUser,
            onRefresh,
            onRetryMessage,
            onSend,
            allowSendWhenInactive,
        },
        persistComposerDraft = true,
        children,
    } = props
    const surfaceRef = useRef<HTMLDivElement | null>(null)
    const interactionDisabled = isSessionInteractionDisabled({
        active: session.active,
        allowSendWhenInactive,
    })
    const attachmentAdapter = useLazyAttachmentAdapter({
        api,
        sessionId: session.id,
        enabled: !interactionDisabled,
    })
    useEffect(() => {
        const leaveSurface = enterControllerSurface(
            `session-chat-runtime:${session.id}`,
            'session-chat-runtime-surface'
        )
        return () => {
            leaveSurface()
        }
    }, [session.id])
    const assistantRuntime = useVibyRuntime({
        session,
        isSending: messageState.isSending,
        onSendMessage: onSend,
        onAbort,
        attachmentAdapter,
        allowSendWhenInactive,
    })

    const threadSession = useMemo(
        () => ({
            api,
            sessionId: session.id,
            metadata: session.metadata,
            agentState: session.agentState,
            disabled: interactionDisabled,
        }),
        [api, interactionDisabled, session.agentState, session.id, session.metadata]
    )

    const threadHandlers = useMemo(
        () => ({
            onRefresh,
            onRetryMessage,
            onFlushPending,
            onAtBottomChange,
            onLoadHistoryUntilPreviousUser,
        }),
        [onAtBottomChange, onFlushPending, onLoadHistoryUntilPreviousUser, onRefresh, onRetryMessage]
    )
    const interactiveRequestModel = useMemo(
        () => ({
            api,
            composerHeight,
            session,
            messages: messageState.messages,
            isReplying: session.thinking || messageState.pendingReply !== null || messageState.stream !== null,
            onSend,
        }),
        [api, composerHeight, messageState.messages, messageState.pendingReply, messageState.stream, onSend, session]
    )

    return (
        <AssistantRuntimeProvider key={session.id} runtime={assistantRuntime}>
            <div ref={surfaceRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                {persistComposerDraft ? <ComposerDraftController sessionId={session.id} /> : null}
                <ActiveInteractiveRequestOwner model={interactiveRequestModel} surfaceRef={surfaceRef} />
                <div className="flex min-h-0 flex-1">
                    <VibyThread
                        key={session.id}
                        session={threadSession}
                        messageState={messageState}
                        handlers={threadHandlers}
                        composerAnchorTop={composerAnchorTop}
                    />
                </div>
                {children}
            </div>
        </AssistantRuntimeProvider>
    )
}

export const SessionChatRuntimeSurface = memo(SessionChatRuntimeSurfaceInner)

function useLazyAttachmentAdapter(options: {
    api: ApiClient
    sessionId: string
    enabled: boolean
}): AttachmentAdapter | undefined {
    const { api, sessionId, enabled } = options
    const [module, setModule] = useState<AttachmentAdapterModule | null>(() => attachmentAdapterModule)

    useEffect(() => {
        if (!enabled || module) {
            return
        }

        let cancelled = false
        void loadAttachmentAdapterModule().then((loadedModule) => {
            if (!cancelled) {
                setModule(loadedModule)
            }
        })

        return () => {
            cancelled = true
        }
    }, [enabled, module])

    return useMemo(() => {
        if (!enabled || !module) {
            return undefined
        }

        return module.getCachedAttachmentAdapter(api, sessionId)
    }, [api, enabled, module, sessionId])
}
