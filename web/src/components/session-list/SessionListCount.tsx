const SESSION_COUNT_MAX = 99
const SESSION_COUNT_OVERFLOW_LABEL = '99+'

type SessionListCountProps = {
    count: number | null
    className: string
}

function formatSessionCount(count: number | null): string {
    if (count === null) return '…'
    return count > SESSION_COUNT_MAX ? SESSION_COUNT_OVERFLOW_LABEL : String(count)
}

export function SessionListCount(props: SessionListCountProps): React.JSX.Element {
    return <span className={props.className}>{formatSessionCount(props.count)}</span>
}
