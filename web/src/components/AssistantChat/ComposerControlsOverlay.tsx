import type { RefObject } from 'react'
import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { AnchoredFloatingOverlay } from '@/components/ChatInput/AnchoredFloatingOverlay'
import { useComposerLiveConfig } from '@/components/AssistantChat/useComposerLiveConfig'
import { useTranslation } from '@/lib/use-translation'

type ComposerControlsOverlayProps = {
    anchorRef: RefObject<HTMLElement | null>
    config: ComposerConfigState
    handlers: ComposerActionHandlers
    controlsDisabled: boolean
    onClose: () => void
}

function renderSections(sections: readonly React.ReactNode[]): React.ReactNode {
    return sections.map((section, index) => (
        <div key={index} className="py-1">
            {index > 0 ? <div className="mx-4 mb-1 h-px bg-[color:color-mix(in_srgb,var(--ds-border-default)_46%,transparent)]" /> : null}
            {section}
        </div>
    ))
}

export default function ComposerControlsOverlay(props: ComposerControlsOverlayProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const sections = useComposerLiveConfig(props)

    if (sections.length === 0) {
        return null
    }

    return (
        <AnchoredFloatingOverlay
            anchorRef={props.anchorRef}
            className="ds-composer-overlay ds-composer-overlay-enter max-w-[min(100%,28rem)]"
            maxHeight={360}
        >
            <div className="px-4 pb-1 pt-3">
                <div className="text-xs font-medium text-[var(--app-hint)]">
                    {t('composer.controls')}
                </div>
            </div>
            {renderSections(sections)}
        </AnchoredFloatingOverlay>
    )
}
