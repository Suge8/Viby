import { useCallback } from 'react'
import { usePlatform } from '@/hooks/usePlatform'

export type ComposerHapticKind = 'light' | 'success' | 'error'
export type ComposerHaptic = (type?: ComposerHapticKind) => void

type ComposerPlatform = {
    haptic: ComposerHaptic
    isTouch: boolean
}

export function useComposerPlatform(): ComposerPlatform {
    const { haptic: platformHaptic, isTouch } = usePlatform()
    const haptic = useCallback<ComposerHaptic>((type = 'light') => {
        if (type === 'light') {
            platformHaptic.impact('light')
            return
        }

        if (type === 'success') {
            platformHaptic.notification('success')
            return
        }

        platformHaptic.notification('error')
    }, [platformHaptic])

    return {
        haptic,
        isTouch
    }
}
