import { useCallback, useEffect, useRef, useState } from 'react'

type UseComposerResumeHintOptions = {
    active: boolean
    allowSendWhenInactive: boolean
    controlledByUser: boolean
    isResuming: boolean
}

type UseComposerResumeHintResult = {
    showResumePlaceholder: boolean
    clearResumeHint: () => void
}

export function useComposerResumeHint(
    options: UseComposerResumeHintOptions
): UseComposerResumeHintResult {
    const {
        active,
        allowSendWhenInactive,
        controlledByUser,
        isResuming
    } = options
    const [showResumeHint, setShowResumeHint] = useState(false)
    const previousControlledByUserRef = useRef(controlledByUser)

    useEffect(() => {
        if (previousControlledByUserRef.current === true && controlledByUser === false) {
            setShowResumeHint(true)
        }
        if (controlledByUser) {
            setShowResumeHint(false)
        }
        previousControlledByUserRef.current = controlledByUser
    }, [controlledByUser])

    const clearResumeHint = useCallback(() => {
        setShowResumeHint(false)
    }, [])

    return {
        showResumePlaceholder: !isResuming && (showResumeHint || (!active && allowSendWhenInactive)),
        clearResumeHint
    }
}
