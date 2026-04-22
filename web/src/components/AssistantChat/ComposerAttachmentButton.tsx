import { useAssistantApi, useAssistantState } from '@assistant-ui/react'
import { useCallback, useRef, useState } from 'react'
import { FeatureAttachmentIcon as AttachmentIcon } from '@/components/featureIcons'
import { Button } from '@/components/ui/button'
import { FileInput } from '@/components/ui/file-input'
import { isWildcardAttachmentAccept, SUPPORTED_ATTACHMENT_ACCEPT } from '@/lib/attachmentAccept'
import { reportWebRuntimeError } from '@/lib/runtimeDiagnostics'
import { cn } from '@/lib/utils'

type ComposerAttachmentButtonProps = {
    disabled: boolean
    ariaLabel: string
    title: string
    className?: string
}

type PickerInputElement = HTMLInputElement & {
    showPicker?: () => void
}

function openNativeFilePicker(input: PickerInputElement): void {
    input.value = ''

    if (typeof input.showPicker === 'function') {
        try {
            input.showPicker()
            return
        } catch {
            // Fall through to click() for browsers that expose showPicker but reject it.
        }
    }

    input.click()
}

export function ComposerAttachmentButton(props: ComposerAttachmentButtonProps): React.JSX.Element {
    const api = useAssistantApi()
    const attachmentAccept = useAssistantState(({ composer }) => {
        const value = composer.attachmentAccept
        if (Array.isArray(value)) {
            return value.join(',')
        }

        return value
    })
    const inputRef = useRef<HTMLInputElement>(null)
    const isHandlingSelectionRef = useRef(false)
    const [isPicking, setIsPicking] = useState(false)

    const handleSelection = useCallback(
        async (input: HTMLInputElement) => {
            if (props.disabled || isPicking || isHandlingSelectionRef.current) {
                return
            }

            const files = Array.from(input.files ?? [])
            if (files.length === 0) {
                return
            }

            isHandlingSelectionRef.current = true
            setIsPicking(true)
            try {
                for (const file of files) {
                    await api.composer().addAttachment(file)
                }
            } catch (error) {
                reportWebRuntimeError('Error adding attachment.', error)
            } finally {
                input.value = ''
                isHandlingSelectionRef.current = false
                setIsPicking(false)
            }
        },
        [api, isPicking, props.disabled]
    )

    const handleChange = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            await handleSelection(event.currentTarget)
        },
        [handleSelection]
    )

    const disabled = props.disabled || isPicking
    const accept = isWildcardAttachmentAccept(attachmentAccept) ? SUPPORTED_ATTACHMENT_ACCEPT : attachmentAccept

    const openPicker = useCallback(() => {
        if (disabled) {
            return
        }

        const input = inputRef.current
        if (!input) {
            return
        }

        openNativeFilePicker(input)
    }, [disabled])

    return (
        <>
            <FileInput
                ref={inputRef}
                multiple
                accept={accept}
                disabled={disabled}
                onChange={handleChange}
                aria-label={props.ariaLabel}
                title={props.title}
                tabIndex={-1}
            />
            <Button
                size="iconSm"
                variant="secondary"
                pressStyle="button"
                onClick={openPicker}
                disabled={disabled}
                aria-label={props.ariaLabel}
                title={props.title}
                className={cn(props.className, disabled ? 'cursor-not-allowed' : undefined)}
            >
                <AttachmentIcon className="h-4.5 w-4.5" />
            </Button>
        </>
    )
}
