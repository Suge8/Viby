import * as React from 'react'

type MaybeThenable = { finally(onFinally: () => void): unknown }

function isThenable(value: unknown): value is MaybeThenable {
    return typeof value === 'object' && value !== null && typeof (value as MaybeThenable).finally === 'function'
}

export function useButtonPending<T extends HTMLElement>(
    onClick: React.MouseEventHandler<T> | undefined,
    controlledPending = false
): [boolean, React.MouseEventHandler<T>] {
    const [localPending, setLocalPending] = React.useState(false)
    const mountedRef = React.useRef(true)
    const pending = controlledPending || localPending
    React.useEffect(
        () => () => {
            mountedRef.current = false
        },
        []
    )
    const handleClick = React.useCallback<React.MouseEventHandler<T>>(
        (event) => {
            if (pending) {
                event.preventDefault()
                return
            }
            const result = onClick?.(event) as unknown
            if (!controlledPending && isThenable(result)) {
                setLocalPending(true)
                result.finally(() => {
                    if (mountedRef.current) setLocalPending(false)
                })
            }
        },
        [controlledPending, onClick, pending]
    )
    return [pending, handleClick]
}
