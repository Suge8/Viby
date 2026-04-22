import type { AttachmentMetadata, MessageMeta, Session } from '@viby/protocol/types'

export type SessionMessageAttachment = AttachmentMetadata

export type InternalSessionMessagePayload = {
    text: string
    localId?: string | null
    attachments?: SessionMessageAttachment[]
    meta?: MessageMeta
}

export type SessionSendMessagePayload = {
    text: string
    localId?: string | null
    attachments?: SessionMessageAttachment[]
    sentFrom?: 'webapp'
}

export type SessionConfigPatch = {
    permissionMode?: Session['permissionMode']
    model?: Session['model']
    modelReasoningEffort?: Session['modelReasoningEffort']
    collaborationMode?: Session['collaborationMode']
}

export type SessionDurableConfigPatch = Omit<SessionConfigPatch, 'collaborationMode'> & {
    collaborationMode?: Session['collaborationMode'] | null
}
