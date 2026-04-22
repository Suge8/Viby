import type { PendingAttachment } from '@assistant-ui/react'
import { AttachmentPrimitive, useThreadComposerAttachment } from '@assistant-ui/react'
import { FeatureCloseIcon as CloseIcon } from '@/components/featureIcons'
import { AlertIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

export function AttachmentItem() {
    const attachment = useThreadComposerAttachment() as PendingAttachment & {
        previewUrl?: string
    }
    const { name, status, type } = attachment
    const isUploading = status.type === 'running'
    const isError = status.type === 'incomplete'
    const previewUrl = attachment.previewUrl

    return (
        <AttachmentPrimitive.Root className="ds-attachment-chip flex items-center gap-3 bg-[var(--app-subtle-bg)] px-3 py-2 text-base text-[var(--app-fg)]">
            {type === 'image' && previewUrl ? (
                <img src={previewUrl} alt={name} className="h-11 w-11 shrink-0 rounded-xl object-cover" />
            ) : null}
            {isUploading ? <Spinner size="sm" label={null} className="text-[var(--app-hint)]" /> : null}
            {isError ? (
                <span className="text-[var(--ds-danger)]">
                    <AlertIcon className="h-4 w-4" />
                </span>
            ) : null}
            <span className="ds-attachment-label truncate text-sm font-medium">{name}</span>
            <AttachmentPrimitive.Remove
                className="ml-auto flex h-5 w-5 items-center justify-center rounded text-[var(--app-hint)] transition-colors hover:text-[var(--app-fg)]"
                aria-label="Remove attachment"
                title="Remove attachment"
            >
                <CloseIcon className="h-3.5 w-3.5" />
            </AttachmentPrimitive.Remove>
        </AttachmentPrimitive.Root>
    )
}
