import { type FocusEvent, type KeyboardEvent, type PointerEvent, useState } from 'react'

export function usePointerFocusRing() {
    const [suppressFocusRing, setSuppressFocusRing] = useState(false)

    const onTriggerPointerDown = (_event: PointerEvent<HTMLElement>) => {
        setSuppressFocusRing(true)
    }

    const onTriggerKeyDown = (_event: KeyboardEvent<HTMLElement>) => {
        setSuppressFocusRing(false)
    }

    const onTriggerBlur = (_event: FocusEvent<HTMLElement>) => {
        setSuppressFocusRing(false)
    }

    return {
        suppressFocusRing,
        onTriggerPointerDown,
        onTriggerKeyDown,
        onTriggerBlur,
    }
}
