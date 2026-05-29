import { memo } from 'react'
import type { PreferredTextRenderMode } from '@/chat/textRenderMode'
import { resolveTextRenderMode } from '@/chat/textRenderMode'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import { PlainTextContent } from '@/components/PlainTextContent'

type TextContentProps = {
    text: string
    mode?: PreferredTextRenderMode
    plainClassName?: string
}

function TextContentComponent(props: TextContentProps): React.JSX.Element {
    const renderMode = props.mode ?? resolveTextRenderMode(props.text, 'auto')
    const plainContent = <PlainTextContent text={props.text} className={props.plainClassName} />

    if (renderMode === 'plain') {
        return plainContent
    }

    return <MarkdownRenderer content={props.text} />
}

export const TextContent = memo(TextContentComponent)
TextContent.displayName = 'TextContent'
