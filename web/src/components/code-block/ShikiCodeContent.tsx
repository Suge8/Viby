import { useShikiHighlighter } from '@/lib/shiki'

type ShikiCodeContentProps = {
    code: string
    language?: string
}

export default function ShikiCodeContent(props: ShikiCodeContentProps): React.JSX.Element {
    const highlighted = useShikiHighlighter(props.code, props.language)

    return <code className="block">{highlighted ?? props.code}</code>
}
