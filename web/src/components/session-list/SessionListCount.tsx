import { memo } from 'react'

const SESSION_COUNT_MAX = 99
const SESSION_COUNT_OVERFLOW_LABEL = '99+'

type SessionListCountProps = {
    count: number
    className: string
}

function formatSessionCount(count: number): string {
    return count > SESSION_COUNT_MAX ? SESSION_COUNT_OVERFLOW_LABEL : String(count)
}

export const SessionListCount = memo(function SessionListCount(
    props: SessionListCountProps
): React.JSX.Element {
    return (
        <span className={props.className}>
            {formatSessionCount(props.count)}
        </span>
    )
})
