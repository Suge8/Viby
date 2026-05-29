import { useEffect, useState } from 'react'
import { InlineNotice } from '@/components/InlineNotice'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

type ConfirmDialogProps = {
    dialog: {
        isOpen: boolean
        onClose: () => void
        title: string
        description: string
        confirmLabel: string
        confirmingLabel: string
        destructive?: boolean
    }
    onConfirm: () => Promise<void>
    isPending: boolean
}

export function ConfirmDialog(props: ConfirmDialogProps) {
    const { t } = useTranslation()
    const dialogErrorPreset = getNoticePreset('dialogError', t)
    const { dialog, onConfirm, isPending } = props
    const { isOpen, onClose, title, description, confirmLabel, confirmingLabel, destructive = false } = dialog

    const [error, setError] = useState<string | null>(null)

    // Clear error when dialog opens/closes
    useEffect(() => {
        if (isOpen) {
            setError(null)
        }
    }, [isOpen])

    const handleConfirm = async () => {
        setError(null)
        try {
            await onConfirm()
            onClose()
        } catch (err) {
            setError(
                formatUserFacingErrorMessage(err, { t, fallbackKey: 'dialog.error.default', allowPassthrough: true })
            )
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="mt-2">{description}</DialogDescription>
                </DialogHeader>

                {error ? (
                    <div className="mt-3">
                        <InlineNotice
                            tone={dialogErrorPreset.tone}
                            title={dialogErrorPreset.title}
                            description={error}
                        />
                    </div>
                ) : null}

                <div className="mt-4 flex gap-2 justify-end">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
                        {t('button.cancel')}
                    </Button>
                    <Button
                        type="button"
                        variant={destructive ? 'destructive' : 'secondary'}
                        onClick={handleConfirm}
                        disabled={isPending}
                        pending={isPending}
                    >
                        {isPending ? confirmingLabel : confirmLabel}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
