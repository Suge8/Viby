import { formatSessionAttachmentMaxUploadError, SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '@viby/protocol'
import type { Context } from 'hono'
import { z } from 'zod'
import type { WebAppEnv } from '../middleware/auth'

export type AttachmentUploadPayload = {
    filename: string
    content: string
    mimeType: string
}

const multipartUploadSchema = z.object({
    mimeType: z.string().trim().min(1).max(255),
})

export async function parseMultipartUploadBody(
    c: Context<WebAppEnv>
): Promise<{ ok: true; data: AttachmentUploadPayload } | { ok: false; response: Response }> {
    let formData: FormData | null
    try {
        formData = await c.req.formData()
    } catch {
        formData = null
    }
    if (!formData) {
        return {
            ok: false,
            response: c.json({ error: 'Invalid body' }, 400),
        }
    }

    const file = formData.get('file')
    const parsedFields = multipartUploadSchema.safeParse({
        mimeType: formData.get('mimeType'),
    })
    if (!(file instanceof File) || !parsedFields.success || !file.name) {
        return {
            ok: false,
            response: c.json({ error: 'Invalid body' }, 400),
        }
    }

    if (file.size > SESSION_ATTACHMENT_MAX_UPLOAD_BYTES) {
        return {
            ok: false,
            response: Response.json(
                { success: false, error: formatSessionAttachmentMaxUploadError() },
                { status: 413 }
            ),
        }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    return {
        ok: true,
        data: {
            filename: file.name,
            content: buffer.toString('base64'),
            mimeType: parsedFields.data.mimeType,
        },
    }
}
