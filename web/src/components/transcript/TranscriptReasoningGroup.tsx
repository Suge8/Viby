import { memo, useCallback, useState } from 'react'
import type { TextRenderMode } from '@/chat/textRenderMode'
import { ChevronIcon } from '@/components/icons'
import { TextContent } from '@/components/TextContent'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { joinClassNames } from '@/lib/joinClassNames'

type TranscriptReasoningGroupProps = {
    text: string
    mode: TextRenderMode
}

function TranscriptReasoningGroupComponent(props: TranscriptReasoningGroupProps): React.JSX.Element | null {
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
            <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={handleToggle}
                aria-expanded={isOpen}
                className={joinClassNames(
                    'gap-1.5 px-0 py-0 text-xs font-medium',
                    'text-[var(--app-hint)] hover:text-[var(--app-fg)]',
                    'transition-colors select-none'
                )}
            >
                <ChevronIcon collapsed={!isOpen} className="h-3 w-3" />
                <span>Reasoning</span>
            </Button>

            <CollapsiblePanel open={isOpen}>
                <div className="ml-0.5 border-l-2 border-[var(--app-border)] pl-4 pt-2">
                    <TextContent text={props.text} mode={props.mode} />
                </div>
            </CollapsiblePanel>
        </div>
    )
}

export const TranscriptReasoningGroup = memo(TranscriptReasoningGroupComponent)
