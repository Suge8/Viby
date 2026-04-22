import { reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'

const DEFAULT_MAX_INLINE_PREVIEW_BYTES = 1024 * 1024

export function createObjectPreviewUrl(file: File): string | undefined {
    if (typeof URL.createObjectURL !== 'function') {
        return undefined
    }

    try {
        return URL.createObjectURL(file)
    } catch {
        return undefined
    }
}

export function revokeObjectPreviewUrl(previewUrl: string | undefined): void {
    if (!previewUrl?.startsWith('blob:') || typeof URL.revokeObjectURL !== 'function') {
        return
    }

    URL.revokeObjectURL(previewUrl)
}

export async function buildDurableImagePreviewUrl(options: {
    file: File
    contentType: string
    maxBytes?: number
}): Promise<string | undefined> {
    const { file, contentType, maxBytes = DEFAULT_MAX_INLINE_PREVIEW_BYTES } = options
    if (file.size > maxBytes) {
        return undefined
    }

    try {
        const previewSource = file.type === contentType ? file : file.slice(0, file.size, contentType)
        return await fileToDataUrl(previewSource)
    } catch (error) {
        reportWebRuntimeWarning('Attachment preview skipped.', error)
        return undefined
    }
}

async function fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            resolve(reader.result as string)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}
