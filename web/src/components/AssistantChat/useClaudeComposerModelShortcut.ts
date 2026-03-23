import { useEffect } from 'react'
import { isClaudeFlavor } from '@/lib/agentFlavorUtils'
import { getNextClaudeComposerModel } from '@/lib/sessionConfigOptions'

type HapticFeedback = (type?: 'light' | 'success' | 'error') => void

type UseClaudeComposerModelShortcutOptions = {
    agentFlavor: string | null
    model: string | null
    onModelChange?: (model: string | null) => void
    haptic: HapticFeedback
}

export function useClaudeComposerModelShortcut(options: UseClaudeComposerModelShortcutOptions): void {
    const { agentFlavor, model, onModelChange, haptic } = options

    useEffect(() => {
        if (!onModelChange || !isClaudeFlavor(agentFlavor)) {
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
    }, [agentFlavor, haptic, model, onModelChange])
}
