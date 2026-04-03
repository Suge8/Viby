import { useEffect } from 'react'
import type { SessionDriver } from '@viby/protocol'
import { getNextClaudeComposerModel } from '@/lib/sessionConfigOptions'

type HapticFeedback = (type?: 'light' | 'success' | 'error') => void

type UseClaudeComposerModelShortcutOptions = {
    sessionDriver: SessionDriver | null
    model: string | null
    onModelChange?: (model: string | null) => void
    haptic: HapticFeedback
}

export function useClaudeComposerModelShortcut(options: UseClaudeComposerModelShortcutOptions): void {
    const { sessionDriver, model, onModelChange, haptic } = options

    useEffect(() => {
        if (!onModelChange || sessionDriver !== 'claude') {
            return
        }
        const handleModelChange = onModelChange

        function handleGlobalKeyDown(event: KeyboardEvent): void {
            if (event.key !== 'm' || (!event.metaKey && !event.ctrlKey)) {
                return
            }

            event.preventDefault()
            handleModelChange(getNextClaudeComposerModel(model))
            haptic('light')
        }

        window.addEventListener('keydown', handleGlobalKeyDown)
        return () => window.removeEventListener('keydown', handleGlobalKeyDown)
    }, [haptic, model, onModelChange, sessionDriver])
}
