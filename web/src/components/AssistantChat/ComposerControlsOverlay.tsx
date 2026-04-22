import type { RefObject } from 'react'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { useComposerLiveConfig } from '@/components/AssistantChat/useComposerLiveConfig'
import { AnchoredFloatingOverlay } from '@/components/ChatInput/AnchoredFloatingOverlay'
import { COMPOSER_CONTROLS_PANEL_TEST_ID } from '@/lib/sessionUiContracts'

const COMPOSER_CONTROLS_PANEL_MAX_HEIGHT = 344
const COMPOSER_CONTROLS_PANEL_MIN_WIDTH = 320

type ComposerControlsOverlayProps = {
    anchorRef: RefObject<HTMLElement | null>
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    controlsDisabled: boolean
    onClose: () => void
}

export default function ComposerControlsOverlay(props: ComposerControlsOverlayProps): React.JSX.Element | null {
    const sections = useComposerLiveConfig(props)

    if (sections.length === 0) {
        return null
    }

    return (
        <AnchoredFloatingOverlay
            anchorRef={props.anchorRef}
            className="ds-composer-overlay ds-composer-overlay-enter ds-composer-overlay-width"
            maxHeight={COMPOSER_CONTROLS_PANEL_MAX_HEIGHT}
            minWidth={COMPOSER_CONTROLS_PANEL_MIN_WIDTH}
        >
            <div data-testid={COMPOSER_CONTROLS_PANEL_TEST_ID} className="space-y-1.5 p-2.5">
                {sections}
            </div>
        </AnchoredFloatingOverlay>
    )
}
