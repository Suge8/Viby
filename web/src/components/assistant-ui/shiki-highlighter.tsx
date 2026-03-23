import { memo } from 'react'
import type { SyntaxHighlighterProps } from '@assistant-ui/react-markdown'
import { CodeContent } from '@/components/code-block/CodeContent'

function SyntaxHighlighterComponent(props: SyntaxHighlighterProps) {
    return (
        <div className="aui-md-codeblock min-w-0 w-full max-w-full overflow-x-auto overflow-y-hidden rounded-b-md bg-[var(--app-code-bg)]">
            <pre className="shiki m-0 w-max min-w-full p-2 text-sm font-mono">
                <CodeContent
                    code={props.code}
                    language={props.language}
                    highlight="always"
                />
            </pre>
        </div>
    )
}

export const SyntaxHighlighter = memo(SyntaxHighlighterComponent)
SyntaxHighlighter.displayName = 'SyntaxHighlighter'
