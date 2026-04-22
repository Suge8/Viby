import { lazy, memo, Suspense } from 'react'
import type { PreferredTextRenderMode } from '@/chat/textRenderMode'
import { resolveTextRenderMode } from '@/chat/textRenderMode'
import { getLoadedMarkdownRendererModule } from '@/components/markdown/loadMarkdownRenderer'
import { PlainTextContent } from '@/components/PlainTextContent'

const LazyMarkdownRenderer = lazy(async () => {
    const module = await import('@/components/MarkdownRenderer')
    return { default: module.MarkdownRenderer }
})

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

    const loadedMarkdownRenderer = getLoadedMarkdownRendererModule()
    if (loadedMarkdownRenderer) {
        const { MarkdownRenderer } = loadedMarkdownRenderer
        return <MarkdownRenderer content={props.text} />
    }

    return (
        <Suspense fallback={plainContent}>
            <LazyMarkdownRenderer content={props.text} />
        </Suspense>
    )
}

export const TextContent = memo(TextContentComponent)
TextContent.displayName = 'TextContent'
