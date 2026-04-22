import { lazy, memo, Suspense } from 'react'
import {
    type CodeHighlightMode,
    resolveCodeLanguage,
    shouldUseShikiHighlight,
} from '@/components/code-block/codeBlockLanguage'
import { PlainCodeContent } from '@/components/code-block/PlainCodeContent'

const LazyShikiCodeContent = lazy(() => import('@/components/code-block/ShikiCodeContent'))

type CodeContentProps = {
    code: string
    language?: string
    highlight?: CodeHighlightMode
}

function CodeContentComponent(props: CodeContentProps): React.JSX.Element {
    const resolvedLanguage = resolveCodeLanguage(props.language)
    const shouldHighlight = shouldUseShikiHighlight({
        code: props.code,
        language: resolvedLanguage,
        highlight: props.highlight,
    })

    if (!shouldHighlight) {
        return <PlainCodeContent code={props.code} />
    }

    return (
        <Suspense fallback={<PlainCodeContent code={props.code} />}>
            <LazyShikiCodeContent code={props.code} language={resolvedLanguage} />
        </Suspense>
    )
}

export const CodeContent = memo(CodeContentComponent)
CodeContent.displayName = 'CodeContent'

export type { CodeHighlightMode } from '@/components/code-block/codeBlockLanguage'
