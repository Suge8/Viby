import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'

const WRAPPER_CLASS_NAME =
    'ds-sessions-create-fab-wrapper pointer-events-none absolute inset-x-0 bottom-0 flex justify-end'
const BUTTON_CLASS_NAME = 'pointer-events-auto shadow-[var(--ds-shadow-soft)]'

type SessionsCreateButtonProps = {
    visible: boolean
    testId: string
    title: string
    onClick: () => unknown
    pending?: boolean
}

export function SessionsCreateButton(props: SessionsCreateButtonProps): JSX.Element | null {
    if (!props.visible || typeof document === 'undefined') {
        return null
    }

    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot) {
        return null
    }

    return createPortal(
        <div className={WRAPPER_CLASS_NAME}>
            <Button
                type="button"
                size="iconLg"
                variant="default"
                onClick={props.onClick}
                pending={props.pending}
                data-testid={props.testId}
                className={BUTTON_CLASS_NAME}
                title={props.title}
                aria-label={props.title}
            >
                <PlusIcon className="h-6 w-6 text-current" />
            </Button>
        </div>,
        overlayRoot
    )
}
