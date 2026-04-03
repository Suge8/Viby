import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'

const WORKSPACE_PENDING_THREAD_SKELETON_CLASS_NAME = 'space-y-3'
const WORKSPACE_PENDING_THREAD_PLACEHOLDER_CLASS_NAME = 'rounded-[1.5rem] bg-[var(--ds-panel-strong)]/75'
const WORKSPACE_PENDING_THREAD_SECONDARY_CLASS_NAME = 'rounded-[1.5rem] bg-[var(--ds-panel-strong)]/60'
const WORKSPACE_PENDING_COMPOSER_CLASS_NAME = 'h-24 rounded-[1.5rem] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)]/85 shadow-[var(--ds-shadow-soft)]'

export function SessionChatWorkspacePendingSurface(): React.JSX.Element {
    return (
        <>
            <SessionChatWorkspaceThreadPendingFallback />
            <SessionChatWorkspaceComposerFallback />
        </>
    )
}

export function SessionChatWorkspaceThreadPendingFallback(): React.JSX.Element {
    return (
        <div
            data-testid="workspace-thread-fallback"
            className="min-h-0 flex-1 overflow-hidden px-3 pt-3"
        >
            <div className="mx-auto w-full ds-stage-shell">
                <div className={WORKSPACE_PENDING_THREAD_SKELETON_CLASS_NAME}>
                    <div className="h-4 w-28 rounded-full bg-[var(--ds-border-subtle)]/70" />
                    <div className={`h-18 w-full ${WORKSPACE_PENDING_THREAD_PLACEHOLDER_CLASS_NAME}`} />
                    <div className={`h-16 w-4/5 ${WORKSPACE_PENDING_THREAD_SECONDARY_CLASS_NAME}`} />
                </div>
            </div>
        </div>
    )
}

export function SessionChatWorkspaceComposerFallback(): React.JSX.Element {
    return (
        <div
            data-testid="workspace-composer-fallback"
            className="session-chat-composer-shell ds-composer-shell shrink-0 px-3 pb-3"
        >
            <div className="mx-auto w-full ds-stage-shell">
                <div className={WORKSPACE_PENDING_COMPOSER_CLASS_NAME} />
            </div>
        </div>
    )
}
