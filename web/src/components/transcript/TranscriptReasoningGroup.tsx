import { memo, useCallback, useState } from 'react'
import type { TextRenderMode } from '@/chat/textRenderMode'
import { FeatureSparklesIcon } from '@/components/featureIcons'
import { ChevronIcon } from '@/components/icons'
import { TextContent } from '@/components/TextContent'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { joinClassNames } from '@/lib/joinClassNames'
import { useTranslation } from '@/lib/use-translation'

type TranscriptReasoningGroupProps = {
    text: string
    mode: TextRenderMode
}

function TranscriptReasoningGroupComponent(props: TranscriptReasoningGroupProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const hasText = props.text.trim().length > 0
    const handleToggle = useCallback(() => {
        setIsOpen((current) => !current)
    }, [])

    if (!hasText) {
        return null
    }

    return (
        <div>
            <div className="flex justify-center">
                <Button
                    type="button"
                    variant="plain"
                    size="sm"
                    pressStyle="chip"
                    onClick={handleToggle}
                    aria-expanded={isOpen}
                    className={joinClassNames(
                        'h-7 min-h-0 gap-1.5 rounded-full px-3 py-0',
                        'text-xs font-medium leading-none',
                        'text-[var(--app-hint)] hover:text-[var(--app-fg)]',
                        'transition-colors select-none'
                    )}
                >
                    <FeatureSparklesIcon className="h-3.5 w-3.5" />
                    <span className="whitespace-nowrap">{t('transcript.reasoning')}</span>
                    <ChevronIcon collapsed={!isOpen} className="h-3 w-3 opacity-70" />
                </Button>
            </div>

            <CollapsiblePanel open={isOpen}>
                <div className="ml-0.5 border-l-2 border-[var(--app-border)] pl-4 pt-2">
                    <TextContent text={props.text} mode={props.mode} />
                </div>
            </CollapsiblePanel>
        </div>
    )
}

export const TranscriptReasoningGroup = memo(TranscriptReasoningGroupComponent)
