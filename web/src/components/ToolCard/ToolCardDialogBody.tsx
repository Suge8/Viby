import type { ToolCallBlock } from '@/chat/types'
import { TextContent } from '@/components/TextContent'
import { ToolJsonInspector } from '@/components/ToolCard/ToolJsonInspector'
import { buildToolTraceItems } from '@/components/ToolCard/trace'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getToolResultPlaceholderText } from './toolCardRenderers'

const TRACE_DEPTH_INDENT_PX = 12

export function ToolCardDialogBody(props: {
    toolTitle: string
    block: ToolCallBlock
    inputLabel: string
    resultLabel: string
    traceLabel: string
}): React.JSX.Element {
    const traceItems = buildToolTraceItems(props.block)

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
                {traceItems.length > 0 ? (
                    <div>
                        <div className="ds-inline-kicker">{props.traceLabel}</div>
                        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-panel)] p-2">
                            {traceItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="rounded-xl bg-[var(--ds-panel-strong)] px-3 py-2"
                                    style={
                                        item.depth > 0
                                            ? { marginLeft: `${item.depth * TRACE_DEPTH_INDENT_PX}px` }
                                            : undefined
                                    }
                                >
                                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-[var(--app-hint)]">
                                        <span>{item.label}</span>
                                        {item.state ? <span className="font-normal">{item.state}</span> : null}
                                    </div>
                                    <TextContent
                                        text={item.detail}
                                        mode="plain"
                                        plainClassName="text-sm text-[var(--app-fg)]"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </DialogContent>
    )
}
