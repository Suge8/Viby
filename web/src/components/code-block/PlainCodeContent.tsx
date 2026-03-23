type PlainCodeContentProps = {
    code: string
}

export function PlainCodeContent(props: PlainCodeContentProps): React.JSX.Element {
    return <code className="block">{props.code}</code>
}
