import { type ImeKeyboardEventSnapshot, isImeKeyboardCompositionActive } from '@/lib/imeInputGuards'

const COMPOSER_SEND_KEY = 'Enter'

type ComposerKeyboardInput = {
    key: string
    shiftKey: boolean
    altKey: boolean
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

    return true
}

export function isComposerCompositionActive(state: ComposerCompositionState): boolean {
    return isImeKeyboardCompositionActive(state)
}
