import { useShikiHighlighter } from '@/lib/shiki'

type ShikiCodeContentProps = {
    code: string
    language?: string
}

export default function ShikiCodeContent(props: ShikiCodeContentProps): React.JSX.Element {
    const highlighted = useShikiHighlighter(props.code, props.language)

    if (!highlighted) {
        return <code className="block">{props.code}</code>
    }

    return <code className="block" dangerouslySetInnerHTML={{ __html: highlighted }} />
}
