import { type ImeKeyboardEventSnapshot, isImeKeyboardCompositionActive } from '@/lib/imeInputGuards'
import type { ComposerEnterBehavior } from './composerEnterBehavior'

const COMPOSER_SEND_KEY = 'Enter'

type ComposerKeyboardInput = {
    enterBehavior: ComposerEnterBehavior
    key: string
    shiftKey: boolean
    altKey: boolean
    ctrlKey: boolean
    metaKey: boolean
    isTouch: boolean
}

type ComposerCompositionState = {
    isComposing: boolean
    nativeEvent?: ImeKeyboardEventSnapshot | null
}

export function shouldComposerSendFromKeyboard(input: ComposerKeyboardInput): boolean {
    if (input.key !== COMPOSER_SEND_KEY) {
        return false
    }

    if (input.altKey || input.shiftKey || input.isTouch) {
        return false
    }

    if (input.enterBehavior === 'modifier-enter-to-send') {
        return input.ctrlKey || input.metaKey
    }

    return !input.ctrlKey && !input.metaKey
}

export function isComposerCompositionActive(state: ComposerCompositionState): boolean {
    return isImeKeyboardCompositionActive(state)
}
