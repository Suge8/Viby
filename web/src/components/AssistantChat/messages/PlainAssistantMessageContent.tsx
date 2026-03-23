type AssistantMessagePart =
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolName?: string }
    | { type: string; text?: string; toolName?: string }

type PlainAssistantMessageContentProps = {
    parts: readonly AssistantMessagePart[]
}

function ToolCallFallback(props: { toolName?: string }): React.JSX.Element {
    return (
        <div className="rounded-xl border border-[var(--app-divider)] bg-[var(--app-secondary-bg)] px-3 py-2 text-sm text-[var(--app-hint)]">
            Tool: {props.toolName ?? 'unknown'}
        </div>
    )
}

export function PlainAssistantMessageContent(props: PlainAssistantMessageContentProps): React.JSX.Element {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            {props.parts.map((part, index) => {
                if (part.type === 'text') {
                    return (
                        <div key={`text:${index}`} className="whitespace-pre-wrap break-words text-base">
                            {part.text}
                        </div>
                    )
                }

                if (part.type === 'reasoning') {
                    return (
                        <div
                            key={`reasoning:${index}`}
                            className="whitespace-pre-wrap break-words text-sm text-[var(--app-hint)]"
                        >
                            {part.text}
                        </div>
                    )
                }

                if (part.type === 'tool-call') {
                    return <ToolCallFallback key={`tool:${index}`} toolName={part.toolName} />
                }

                return null
            })}
        </div>
    )
}
