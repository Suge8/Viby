import type { PendingAttachment } from '@assistant-ui/react'
import { AttachmentPrimitive, useThreadComposerAttachment } from '@assistant-ui/react'
import { FeatureCloseIcon as CloseIcon } from '@/components/featureIcons'
import { AlertIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import type { AttachmentErrorDescriptor } from '@/lib/attachmentAdapter'
import { useTranslation } from '@/lib/use-translation'

export function AttachmentItem() {
    const attachment = useThreadComposerAttachment() as PendingAttachment & {
        previewUrl?: string
        errorDescriptor?: AttachmentErrorDescriptor
    }
    const { t } = useTranslation()
    const { name, status, type } = attachment
    const isUploading = status.type === 'running'
    const isError = status.type === 'incomplete'
    const previewUrl = attachment.previewUrl
    // Render the structured error descriptor as a native `title` tooltip so
    // the user can hover the red alert and see the real failure reason
    // (e.g. `文件过大（60MB > 50MB）`, `HTTP 413`, `网络中断`) instead of
    // a silent exclamation. Falls back to the chip name when the adapter
    // could not classify the failure, which still beats an empty tooltip.
    const errorTooltip = isError
        ? attachment.errorDescriptor
            ? t(attachment.errorDescriptor.titleKey, attachment.errorDescriptor.titleParams)
            : t('remotePairing.error.uploadFailed')
        : undefined

    return (
        <AttachmentPrimitive.Root
            className="ds-attachment-chip flex items-center gap-3 bg-[var(--app-subtle-bg)] px-3 py-2 text-base text-[var(--app-fg)]"
            title={errorTooltip}
        >
            {type === 'image' && previewUrl ? (
                <img src={previewUrl} alt={name} className="h-11 w-11 shrink-0 rounded-xl object-cover" />
            ) : null}
            {isUploading ? <Spinner size="sm" label={null} className="text-[var(--app-hint)]" /> : null}
            {isError ? (
                <span className="text-[var(--ds-danger)]" title={errorTooltip} aria-label={errorTooltip}>
                    <AlertIcon className="h-4 w-4" />
                </span>
            ) : null}
            <span className="ds-attachment-label truncate text-sm font-medium" title={errorTooltip}>
                {name}
            </span>
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
