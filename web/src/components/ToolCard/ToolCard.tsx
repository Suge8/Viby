import { memo, useMemo } from 'react'
import type { ApiClient } from '@/api/client'
import type { ToolCallBlock } from '@/chat/types'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { ToolCardDialogBody } from '@/components/ToolCard/ToolCardDialogBody'
import { ToolCardHeader } from '@/components/ToolCard/toolCardChrome'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { getInteractiveCardClassName } from '@/components/ui/interactiveCardStyles'
import { PlainButton } from '@/components/ui/plain-button'
import { usePointerFocusRing } from '@/hooks/usePointerFocusRing'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { SessionMetadataSummary } from '@/types/api'

type ToolCardProps = {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    onDone: () => void
    block: ToolCallBlock
}

function ToolCardInner(props: ToolCardProps): React.JSX.Element {
    const { t } = useTranslation()
    const presentation = useMemo(
        () =>
            getToolPresentation({
                toolName: props.block.tool.name,
                input: props.block.tool.input,
                result: props.block.tool.result,
                childrenCount: props.block.children.length,
                description: props.block.tool.description,
                metadata: props.metadata,
            }),
        [
            props.block.children.length,
            props.block.tool.description,
            props.block.tool.input,
            props.block.tool.name,
            props.block.tool.result,
            props.metadata,
        ]
    )

    const toolTitle = presentation.title
    const subtitle = presentation.subtitle ?? props.block.tool.description ?? undefined
    const runningFrom = props.block.tool.startedAt ?? props.block.tool.createdAt
    const { suppressFocusRing, onTriggerPointerDown, onTriggerKeyDown, onTriggerBlur } = usePointerFocusRing()
    const triggerClassName = cn(
        getInteractiveCardClassName('section-trigger'),
        suppressFocusRing && 'focus-visible:ring-0'
    )

    return (
        <div className="ds-tool-card-surface w-full overflow-hidden shadow-none">
            <Dialog>
                <DialogTrigger asChild>
                    <PlainButton
                        type="button"
                        data-testid="tool-card-trigger"
                        className={triggerClassName}
                        onPointerDown={onTriggerPointerDown}
                        onKeyDown={onTriggerKeyDown}
                        onBlur={onTriggerBlur}
                        data-prevent-message-copy
                    >
                        <ToolCardHeader
                            icon={presentation.icon}
                            toolTitle={toolTitle}
                            subtitle={subtitle}
                            runningFrom={runningFrom}
                            state={props.block.tool.state}
                        />
                    </PlainButton>
                </DialogTrigger>

                <ToolCardDialogBody
                    toolTitle={toolTitle}
                    block={props.block}
                    inputLabel={t('tool.input')}
                    resultLabel={t('tool.result')}
                    traceLabel={t('tool.trace')}
                />
            </Dialog>
        </div>
    )
}

export const ToolCard = memo(ToolCardInner)
