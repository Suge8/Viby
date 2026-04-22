import { useEffect } from 'react'
import type { SessionChatWorkspaceMessageState } from '@/components/sessionChatWorkspaceTypes'
import { syncResolvedPostSwitchWarning } from '@/routes/sessions/postSwitchSendRecovery'

export function useResolvedPostSwitchWarningSync(options: {
    sessionId: string
    messages: SessionChatWorkspaceMessageState['messages']
    messagesWarning: SessionChatWorkspaceMessageState['warning']
    streamText: string
}): void {
    useEffect(() => {
        syncResolvedPostSwitchWarning({
            sessionId: options.sessionId,
            messages: options.messages,
            warning: options.messagesWarning,
            streamText: options.streamText,
        })
    }, [options.messages, options.messagesWarning, options.sessionId, options.streamText])
}
