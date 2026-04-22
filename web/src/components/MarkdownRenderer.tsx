import { MarkdownPrimitive } from '@/components/markdown/MarkdownPrimitive'

interface MarkdownRendererProps {
    content: string
}

export function MarkdownRenderer(props: MarkdownRendererProps): React.JSX.Element {
    return <MarkdownPrimitive content={props.content} className="text-base" />
}
