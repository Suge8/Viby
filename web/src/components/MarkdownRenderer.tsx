import { TextMessagePartProvider } from '@assistant-ui/react'
import { MarkdownPrimitive } from '@/components/markdown/MarkdownPrimitive'

interface MarkdownRendererProps {
    content: string
}

function MarkdownContent(props: MarkdownRendererProps) {
    return (
        <TextMessagePartProvider text={props.content}>
            <MarkdownPrimitive className="text-base" />
        </TextMessagePartProvider>
    )
}

export function MarkdownRenderer(props: MarkdownRendererProps) {
    return <MarkdownContent {...props} />
}
