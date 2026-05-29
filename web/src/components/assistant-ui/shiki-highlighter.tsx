import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown'
import { memo } from 'react'
import { CodeContent, type CodeHighlightMode } from '@/components/code-block/CodeContent'
import { CodeSurface } from '@/components/code-block/CodeSurface'

type VibySyntaxHighlighterProps = SyntaxHighlighterProps & {
    highlight?: CodeHighlightMode
}

function SyntaxHighlighterComponent(props: VibySyntaxHighlighterProps) {
    return (
        <CodeSurface className="aui-md-codeblock rounded-b-md rounded-t-none" preClassName="p-2 text-sm">
            <CodeContent code={props.code} language={props.language} highlight={props.highlight ?? 'auto'} />
        </CodeSurface>
    )
}

export const SyntaxHighlighter = memo(SyntaxHighlighterComponent)
SyntaxHighlighter.displayName = 'SyntaxHighlighter'
