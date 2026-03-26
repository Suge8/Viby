import { useState, useEffect, type FC, type PropsWithChildren } from 'react'
import { useMessage } from '@assistant-ui/react'
import { ChevronIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { MarkdownPrimitive } from '@/components/markdown/MarkdownPrimitive'
import { joinClassNames } from '@/lib/joinClassNames'

function ShimmerDot() {
    return (
        <span className="inline-block w-1.5 h-1.5 bg-current rounded-full animate-pulse" />
    )
}

/**
 * Renders individual reasoning message part content with markdown support.
 */
export const Reasoning: FC = () => {
    return (
        <MarkdownPrimitive
            className="aui-reasoning-content min-w-0 max-w-full break-words text-sm text-[var(--app-hint)]"
        />
    )
}

/**
 * Wraps consecutive reasoning parts in a collapsible container.
 * Shows shimmer effect while reasoning is streaming.
 */
export const ReasoningGroup: FC<PropsWithChildren> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false)

    // Check if reasoning is still streaming
    const message = useMessage()
    const isStreaming = message.status?.type === 'running'
        && message.content.length > 0
        && message.content[message.content.length - 1]?.type === 'reasoning'

    // Auto-expand while streaming
    useEffect(() => {
        if (isStreaming) {
            setIsOpen(true)
        }
    }, [isStreaming])

    return (
        <div className="aui-reasoning-group my-2">
            <Button
                type="button"
                variant="plain"
                size="sm"
                onClick={() => setIsOpen(current => !current)}
                aria-expanded={isOpen}
                className={joinClassNames(
                    'gap-1.5 px-0 py-0 text-xs font-medium',
                    'text-[var(--app-hint)] hover:text-[var(--app-fg)]',
                    'transition-colors select-none'
                )}
            >
                <ChevronIcon collapsed={!isOpen} className="h-3 w-3" />
                <span>Reasoning</span>
                {isStreaming && (
                    <span className="flex items-center gap-1 ml-1 text-[var(--app-hint)]">
                        <ShimmerDot />
                    </span>
                )}
            </Button>

            <CollapsiblePanel open={isOpen}>
                <div className="pl-4 pt-2 border-l-2 border-[var(--app-border)] ml-0.5">
                    {children}
                </div>
            </CollapsiblePanel>
        </div>
    )
}
