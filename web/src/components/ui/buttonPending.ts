import * as React from 'react'

type MaybeThenable = { then(onFulfilled: () => void, onRejected: () => void): unknown }
type PendingAction<TArgs extends readonly unknown[]> = (...args: TArgs) => unknown

function isThenable(value: unknown): value is MaybeThenable {
    return typeof value === 'object' && value !== null && typeof (value as MaybeThenable).then === 'function'
}

export function usePendingAction<TArgs extends readonly unknown[]>(
    action: PendingAction<TArgs> | undefined,
    controlledPending = false
): [boolean, PendingAction<TArgs>] {
    const [localPending, setLocalPending] = React.useState(false)
    const mountedRef = React.useRef(true)
    const pendingRef = React.useRef(false)
    const pending = controlledPending || localPending
    React.useEffect(() => {
        pendingRef.current = pending
    }, [pending])
    React.useEffect(
        () => () => {
            mountedRef.current = false
        },
        []
    )
    const run = React.useCallback<PendingAction<TArgs>>(
        (...args) => {
            if (pendingRef.current) {
                return undefined
            }
            const result = action?.(...args)
            if (!controlledPending && isThenable(result)) {
                pendingRef.current = true
                setLocalPending(true)
                const finishPending = () => {
                    pendingRef.current = false
                    if (mountedRef.current) setLocalPending(false)
                }
                result.then(finishPending, finishPending)
            }
            return result
        },
        [action, controlledPending]
    )
    return [pending, run]
}

export function useButtonPending<T extends HTMLElement>(
    onClick: React.MouseEventHandler<T> | undefined,
    controlledPending = false
): [boolean, React.MouseEventHandler<T>] {
    const [pending, run] = usePendingAction<[React.MouseEvent<T>]>(onClick, controlledPending)
    const handleClick = React.useCallback<React.MouseEventHandler<T>>(
        (event) => {
            if (pending) {
                event.preventDefault()
                return
            }
            run(event)
        },
        [pending, run]
    )
    return [pending, handleClick]
}
