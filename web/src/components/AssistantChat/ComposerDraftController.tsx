import { useLocation } from '@tanstack/react-router'
import { useComposerDraftPersistence } from '@/components/AssistantChat/useComposerDraftPersistence'

type ComposerDraftControllerProps = {
    sessionId: string
}

export function ComposerDraftController(props: ComposerDraftControllerProps): null {
    const activationKey = useLocation({
        select: location => String(location.state?.__TSR_key ?? location.href)
    })

    useComposerDraftPersistence({
        sessionId: props.sessionId,
        activationKey
    })

    return null
}
