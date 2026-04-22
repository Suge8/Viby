import { TextContent } from '@/components/TextContent'
import { cn } from '@/lib/utils'

type ToolMarkdownQuestionProps = {
    text: string
    className?: string
}

type ToolMarkdownOptionContentProps = {
    title: string
    description?: string | null
    selected?: boolean
}

export function ToolMarkdownQuestion(props: ToolMarkdownQuestionProps) {
    return (
        <div className={cn('[&_.aui-md]:text-sm [&_.aui-md]:text-[var(--app-fg)]', props.className)}>
            <TextContent text={props.text} mode="markdown" />
        </div>
    )
}

export function ToolMarkdownOptionContent(props: ToolMarkdownOptionContentProps) {
    return (
        <span className="min-w-0 flex-1">
            <div
                className={cn(
                    '[&_.aui-md]:text-sm',
                    props.selected
                        ? '[&_.aui-md]:font-medium [&_.aui-md]:text-emerald-700 dark:[&_.aui-md]:text-emerald-300'
                        : '[&_.aui-md]:text-[var(--app-fg)]'
                )}
            >
                <TextContent text={props.title} mode="markdown" />
            </div>
            {props.description ? (
                <div className="mt-0.5 [&_.aui-md]:text-xs [&_.aui-md]:text-[var(--app-hint)]">
                    <TextContent text={props.description} mode="markdown" />
                </div>
            ) : null}
        </span>
    )
}

export function ToolMarkdownButtonOptionContent(props: Omit<ToolMarkdownOptionContentProps, 'selected'>) {
    return (
        <span className="min-w-0 flex-1">
            <div className="[&_.aui-md]:font-medium [&_.aui-md]:text-sm [&_.aui-md]:text-[var(--app-fg)]">
                <TextContent text={props.title} mode="markdown" />
            </div>
            {props.description ? (
                <div className="mt-0.5 [&_.aui-md]:text-xs [&_.aui-md]:text-[var(--app-hint)]">
                    <TextContent text={props.description} mode="markdown" />
                </div>
            ) : null}
        </span>
    )
}
