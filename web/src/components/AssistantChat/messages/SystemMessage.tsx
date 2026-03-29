import { useAssistantState } from '@assistant-ui/react'
import { AppNotice } from '@/components/AppNotice'
import { UsersIcon } from '@/components/icons'
import { getVibyMessageMetadata } from '@/components/AssistantChat/messages/messageMetadata'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import { getEventPresentation } from '@/chat/presentation'

function resolveSystemMessageIcon(
    isTeamNotice: boolean,
    icon: React.ReactNode
): React.JSX.Element | undefined {
    if (isTeamNotice) {
        return <UsersIcon className="h-4 w-4" />
    }
    if (!icon) {
        return undefined
    }

    return <span aria-hidden="true">{icon}</span>
}

export function VibySystemMessage() {
    const messageId = useAssistantState(({ message }) => message.id)
    const role = useAssistantState(({ message }) => message.role)
    const text = useAssistantState(({ message }) => {
        if (message.role !== 'system') return ''
        return message.content[0]?.type === 'text' ? message.content[0].text : ''
    })
    const icon = useAssistantState(({ message }) => {
        if (message.role !== 'system') return null
        const custom = getVibyMessageMetadata(message)
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).icon : null
    })
    const tone = useAssistantState(({ message }) => {
        if (message.role !== 'system') return 'default'
        const custom = getVibyMessageMetadata(message)
        if (custom?.kind === 'team-notice') {
            return 'info'
        }
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).tone : 'default'
    })
    const isTeamNotice = useAssistantState(({ message }) => {
        if (message.role !== 'system') return false
        const custom = getVibyMessageMetadata(message)
        return custom?.kind === 'team-notice'
    })

    if (role !== 'system') return null

    return (
        <div className="py-1" {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId }}>
            <AppNotice
                layout="inline"
                tone={tone}
                icon={resolveSystemMessageIcon(isTeamNotice, icon)}
                title={text}
                className="mx-auto max-w-[min(100%,32rem)]"
            />
        </div>
    )
}
