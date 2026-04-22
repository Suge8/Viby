import type { CSSProperties, JSX } from 'react'
import { createPortal } from 'react-dom'
import { PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'

const MOBILE_CREATE_BUTTON_EDGE_OFFSET = 'var(--app-overlay-edge-offset)'
const MOBILE_CREATE_BUTTON_WRAPPER_CLASS_NAME = 'pointer-events-none absolute inset-x-0 bottom-0 flex justify-end'
const SESSIONS_MOBILE_CREATE_BUTTON_CLASS_NAME = 'pointer-events-auto shadow-[var(--ds-shadow-soft)]'

type SessionsMobileCreateButtonProps = {
    visible: boolean
    testId: string
    title: string
    onClick: () => void
}

export function SessionsMobileCreateButton(props: SessionsMobileCreateButtonProps): JSX.Element | null {
    if (!props.visible || typeof document === 'undefined') {
        return null
    }

    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot) {
        return null
    }

    const wrapperStyle: CSSProperties = {
        paddingBottom: `max(${MOBILE_CREATE_BUTTON_EDGE_OFFSET}, calc(var(--app-safe-area-inset-bottom) + ${MOBILE_CREATE_BUTTON_EDGE_OFFSET}))`,
        paddingRight: `max(${MOBILE_CREATE_BUTTON_EDGE_OFFSET}, calc(var(--app-safe-area-inset-right) + ${MOBILE_CREATE_BUTTON_EDGE_OFFSET}))`,
    }

    return createPortal(
        <div className={MOBILE_CREATE_BUTTON_WRAPPER_CLASS_NAME} style={wrapperStyle}>
            <Button
                type="button"
                size="iconLg"
                variant="default"
                onClick={props.onClick}
                data-testid={props.testId}
                className={SESSIONS_MOBILE_CREATE_BUTTON_CLASS_NAME}
                title={props.title}
                aria-label={props.title}
            >
                <PlusIcon className="h-6 w-6 text-current" />
            </Button>
        </div>,
        overlayRoot
    )
}
