import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown'
import { memo } from 'react'
import { CodeContent } from '@/components/code-block/CodeContent'
import { CodeSurface } from '@/components/code-block/CodeSurface'

function SyntaxHighlighterComponent(props: SyntaxHighlighterProps) {
    return (
        <CodeSurface className="aui-md-codeblock rounded-b-md rounded-t-none" preClassName="p-2 text-sm">
            <CodeContent code={props.code} language={props.language} highlight="auto" />
        </CodeSurface>
    )
}

export const SyntaxHighlighter = memo(SyntaxHighlighterComponent)
SyntaxHighlighter.displayName = 'SyntaxHighlighter'
