const COMPOSER_SEND_KEY = 'Enter'

type ComposerKeyboardInput = {
    key: string
    ctrlKey: boolean
    metaKey: boolean
    altKey: boolean
}

type ComposerCompositionState = {
    isComposing: boolean
    nativeIsComposing: boolean
}

export function isComposerSendShortcut(input: ComposerKeyboardInput): boolean {
    if (input.key !== COMPOSER_SEND_KEY) {
        return false
    }

    if (input.altKey) {
        return false
    }

    return input.ctrlKey || input.metaKey
}

export function isComposerCompositionActive(state: ComposerCompositionState): boolean {
    return state.isComposing || state.nativeIsComposing
}
