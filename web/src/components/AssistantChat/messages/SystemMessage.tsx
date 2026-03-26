import { useAssistantState } from '@assistant-ui/react'
import { AppNotice } from '@/components/AppNotice'
import { getVibyMessageMetadata } from '@/components/AssistantChat/messages/messageMetadata'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import { getEventPresentation } from '@/chat/presentation'

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
        const event = custom?.kind === 'event' ? custom.event : undefined
        return event ? getEventPresentation(event).tone : 'default'
    })

    if (role !== 'system') return null

    return (
        <div className="py-1" {...{ [THREAD_MESSAGE_ID_ATTRIBUTE]: messageId }}>
            <AppNotice
                layout="inline"
                tone={tone}
                icon={icon ? <span aria-hidden="true">{icon}</span> : undefined}
                title={text}
                className="mx-auto max-w-[min(100%,32rem)]"
            />
        </div>
    )
}
