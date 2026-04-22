import { CodeBlock } from '@/components/CodeBlock'
import type { FileDisplayMode } from '@/routes/sessions/filePageUtils'

type FileContentViewProps = {
    content: string
    language?: string
    mode: FileDisplayMode
    showCopyButton: boolean
}

export default function FileContentView(props: FileContentViewProps): React.JSX.Element {
    if (props.mode === 'diff') {
        return <CodeBlock code={props.content} language="diff" highlight="auto" showCopyButton={false} />
    }

    return (
        <CodeBlock
            code={props.content}
            language={props.language}
            highlight="auto"
            showCopyButton={props.showCopyButton}
        />
    )
}
