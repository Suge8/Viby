import { safeStringify } from '@viby/protocol'
import { useMemo } from 'react'
import { CodeBlock } from '@/components/CodeBlock'

type ToolJsonInspectorProps = {
    value: unknown
    emptyText?: string
}

export function ToolJsonInspector(props: ToolJsonInspectorProps): React.JSX.Element {
    const content = useMemo(() => {
        if (props.value === undefined) {
            return props.emptyText ?? ''
        }

        return safeStringify(props.value)
    }, [props.emptyText, props.value])

    return <CodeBlock code={content} language="json" highlight="never" />
}
