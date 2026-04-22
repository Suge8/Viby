import { useCallback, useEffect, useRef, useState } from 'react'

type UseComposerResumeHintOptions = {
    active: boolean
    allowSendWhenInactive: boolean
    controlledByUser: boolean
}

type UseComposerResumeHintResult = {
    showResumePlaceholder: boolean
    clearResumeHint: () => void
}

export function useComposerResumeHint(options: UseComposerResumeHintOptions): UseComposerResumeHintResult {
    const { active, allowSendWhenInactive, controlledByUser } = options
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
        showResumePlaceholder: showResumeHint || (!active && allowSendWhenInactive),
        clearResumeHint,
    }
}
