import type { ToolCallBlock } from '@/chat/types'
import { ToolJsonInspector } from '@/components/ToolCard/ToolJsonInspector'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getToolResultPlaceholderText } from './toolCardRenderers'

export function ToolCardDialogBody(props: {
    toolTitle: string
    block: ToolCallBlock
    inputLabel: string
    resultLabel: string
}): React.JSX.Element {
    return (
        <DialogContent className="max-w-2xl">
            <DialogHeader>
                <DialogTitle>{props.toolTitle}</DialogTitle>
            </DialogHeader>
            <div className="ds-dialog-scroll-body ds-dialog-scroll-body-tall mt-3 flex flex-col gap-4">
                <div>
                    <div className="ds-inline-kicker">{props.inputLabel}</div>
                    <ToolJsonInspector value={props.block.tool.input} />
                </div>
                <div>
                    <div className="ds-inline-kicker">{props.resultLabel}</div>
                    <ToolJsonInspector
                        value={props.block.tool.result}
                        emptyText={getToolResultPlaceholderText(props.block.tool.state)}
                    />
                </div>
            </div>
        </DialogContent>
    )
}
