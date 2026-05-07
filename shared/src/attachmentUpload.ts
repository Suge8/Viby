export const SESSION_ATTACHMENT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
export const SESSION_ATTACHMENT_MAX_UPLOAD_MB = SESSION_ATTACHMENT_MAX_UPLOAD_BYTES / 1024 / 1024

export function formatSessionAttachmentMaxUploadError(): string {
    return `File too large (max ${SESSION_ATTACHMENT_MAX_UPLOAD_MB}MB)`
}
