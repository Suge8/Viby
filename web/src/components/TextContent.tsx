import { lazy, memo, Suspense, useMemo } from 'react'
import type { PreferredTextRenderMode } from '@/chat/textRenderMode'
import { resolveTextRenderMode } from '@/chat/textRenderMode'
import { PlainTextContent } from '@/components/PlainTextContent'

let markdownRendererModulePromise: Promise<{ default: typeof import('@/components/MarkdownRenderer').MarkdownRenderer }> | null = null

function loadMarkdownRendererModule() {
    markdownRendererModulePromise ??= import('@/components/MarkdownRenderer').then((module) => ({
        default: module.MarkdownRenderer,
    }))
    return markdownRendererModulePromise
}

const LazyMarkdownRenderer = lazy(loadMarkdownRendererModule)

type TextContentProps = {
    text: string
    mode?: PreferredTextRenderMode
    plainClassName?: string
}

function TextContentComponent(props: TextContentProps): React.JSX.Element {
    const renderMode = useMemo(
        () => props.mode ?? resolveTextRenderMode(props.text, 'auto'),
        [props.mode, props.text]
    )
    const plainContent = <PlainTextContent text={props.text} className={props.plainClassName} />

    if (renderMode === 'plain') {
        return plainContent
    }

    return (
        <Suspense fallback={plainContent}>
            <LazyMarkdownRenderer content={props.text} />
        </Suspense>
    )
}

export const TextContent = memo(TextContentComponent)
TextContent.displayName = 'TextContent'
