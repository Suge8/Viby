import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import { PlainTextContent } from '@/components/PlainTextContent'

type PlainAssistantMessageContentProps = {
    parts: readonly ThreadAssistantMessagePart[]
}

function getVisibleText(text: string | undefined): string | null {
    if (typeof text !== 'string') {
        return null
    }
    return text.trim().length > 0 ? text : null
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
                    const visibleText = getVisibleText(part.text)
                    if (!visibleText) {
                        return null
                    }
                    return (
                        <PlainTextContent key={`text:${index}`} text={visibleText} />
                    )
                }

                if (part.type === 'reasoning') {
                    const visibleText = getVisibleText(part.text)
                    if (!visibleText) {
                        return null
                    }
                    return (
                        <PlainTextContent
                            key={`reasoning:${index}`}
                            text={visibleText}
                            className="text-sm text-[var(--app-hint)]"
                        />
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
