import {
    type SessionHandoffAttachment,
    SessionHandoffAttachmentSchema,
    SessionHandoffContractError,
} from './sessionHandoffContract'

export function readSessionHandoffAttachments(
    content: Record<string, unknown>,
    messageIndex: number
): SessionHandoffAttachment[] {
    if (!('attachments' in content) || content.attachments == null) {
        return []
    }
    if (!Array.isArray(content.attachments)) {
        throw new SessionHandoffContractError(
            'attachment_payload_invalid',
            `messages[${messageIndex}].content.attachments`
        )
    }

    const attachments: SessionHandoffAttachment[] = []
    for (let index = 0; index < content.attachments.length; index += 1) {
        const parsed = SessionHandoffAttachmentSchema.safeParse(content.attachments[index])
        if (!parsed.success) {
            throw new SessionHandoffContractError(
                'attachment_payload_invalid',
                `messages[${messageIndex}].content.attachments[${index}]`
            )
        }
        attachments.push(parsed.data)
    }

    return attachments
}

export function mergeSessionHandoffAttachments(
    attachmentsByPath: Map<string, SessionHandoffAttachment>,
    attachments: ReadonlyArray<SessionHandoffAttachment>,
    messageIndex: number
): void {
    for (let index = 0; index < attachments.length; index += 1) {
        const attachment = attachments[index]
        const previous = attachmentsByPath.get(attachment.path)
        if (!previous) {
            attachmentsByPath.set(attachment.path, attachment)
            continue
        }

        const isSameAttachment =
            previous.filename === attachment.filename &&
            previous.mimeType === attachment.mimeType &&
            previous.size === attachment.size
        if (!isSameAttachment) {
            throw new SessionHandoffContractError(
                'attachment_payload_invalid',
                `messages[${messageIndex}].content.attachments[${index}]`
            )
        }
    }
}
