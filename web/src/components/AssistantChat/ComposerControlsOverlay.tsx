import type { ComposerActionHandlers, ComposerConfigState } from '@/components/AssistantChat/composerTypes'
import { useComposerLiveConfig } from '@/components/AssistantChat/useComposerLiveConfig'
import { FloatingOverlay } from '@/components/ChatInput/FloatingOverlay'
import { useTranslation } from '@/lib/use-translation'

type ComposerControlsOverlayProps = {
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
        <div className="absolute bottom-[100%] left-0 right-0 mb-2 flex justify-start">
            <FloatingOverlay
                className="ds-composer-overlay ds-composer-overlay-enter w-full max-w-[min(100%,28rem)]"
                maxHeight={360}
            >
                <div className="px-4 pb-1 pt-3">
                    <div className="text-xs font-medium text-[var(--app-hint)]">
                        {t('composer.controls')}
                    </div>
                </div>
                {renderSections(sections)}
            </FloatingOverlay>
        </div>
    )
}
