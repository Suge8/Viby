import { Suspense, lazy, memo } from 'react'
import { PlainCodeContent } from '@/components/code-block/PlainCodeContent'
import {
    resolveCodeLanguage,
    shouldUseShikiHighlight,
    type CodeHighlightMode
} from '@/components/code-block/codeBlockLanguage'

const LazyShikiCodeContent = lazy(() => import('@/components/code-block/ShikiCodeContent'))

type CodeContentProps = {
    code: string
    language?: string
    highlight?: CodeHighlightMode
}

function CodeContentComponent(props: CodeContentProps): React.JSX.Element {
    const resolvedLanguage = resolveCodeLanguage(props.language)
    const shouldHighlight = shouldUseShikiHighlight({
        language: resolvedLanguage,
        highlight: props.highlight
    })

    if (!shouldHighlight) {
        return <PlainCodeContent code={props.code} />
    }

    return (
        <Suspense fallback={<PlainCodeContent code={props.code} />}>
            <LazyShikiCodeContent
                code={props.code}
                language={resolvedLanguage}
            />
        </Suspense>
    )
}

export const CodeContent = memo(CodeContentComponent)
CodeContent.displayName = 'CodeContent'

export type { CodeHighlightMode } from '@/components/code-block/codeBlockLanguage'
